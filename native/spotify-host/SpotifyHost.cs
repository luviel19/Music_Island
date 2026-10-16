// Встроенный веб-плеер Spotify на Microsoft Edge WebView2 (официальная страница open.spotify.com).
// Окно без рамки принадлежит окну Music Island (не появляется в панели задач), позиция и видимость
// задаются командами из stdin (по строке JSON). События пишутся в stdout. Без Node, без IPC со страницей.
// Сборка: native/spotify-host/build.ps1
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class WinAudio
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int m, out IntPtr d); int GetDefaultAudioEndpoint(int f, int r, out IMMDevice e); }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        int GetAudioSessionControl(IntPtr g, int f, out IntPtr c);
        int GetSimpleAudioVolume(IntPtr g, int f, out IntPtr v);
        int GetSessionEnumerator(out IAudioSessionEnumerator e);
    }
    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator { int GetCount(out int n); int GetSession(int i, out IAudioSessionControl2 s); }
    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        int GetState(out int s); int GetDisplayName(out IntPtr n); int SetDisplayName(IntPtr n, ref Guid c);
        int GetIconPath(out IntPtr p); int SetIconPath(IntPtr p, ref Guid c); int GetGroupingParam(out Guid g);
        int SetGroupingParam(ref Guid g, ref Guid c); int RegisterAudioSessionNotification(IntPtr n); int UnregisterAudioSessionNotification(IntPtr n);
        int GetSessionIdentifier(out IntPtr i); int GetSessionInstanceIdentifier(out IntPtr i); int GetProcessId(out uint pid);
        int IsSystemSoundsSession(); int SetDuckingPreference(bool o);
    }
    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume { int SetMasterVolume(float l, ref Guid c); int GetMasterVolume(out float l); int SetMute(bool m, ref Guid c); int GetMute(out bool m); }

    // Потомки процесса (WebView2 играет звук в дочернем процессе)
    static HashSet<int> Tree(int root)
    {
        var kids = new Dictionary<int, List<int>>();
        using (var q = new System.Management.ManagementObjectSearcher("SELECT ProcessId, ParentProcessId FROM Win32_Process"))
            foreach (System.Management.ManagementBaseObject o in q.Get())
            {
                int pid = Convert.ToInt32(o["ProcessId"]), par = Convert.ToInt32(o["ParentProcessId"]);
                List<int> l; if (!kids.TryGetValue(par, out l)) kids[par] = l = new List<int>();
                l.Add(pid);
            }
        var set = new HashSet<int> { root }; var st = new Stack<int>(); st.Push(root);
        while (st.Count > 0) { List<int> l; if (kids.TryGetValue(st.Pop(), out l)) foreach (var k in l) if (set.Add(k)) st.Push(k); }
        return set;
    }

    // set != null: выставить громкость. Возвращает текущую громкость наших звуковых сессий или -1, если звука ещё нет.
    public static string LastErr; public static int Sessions, Matched;
    public static float Apply(int rootPid, float? set)
    {
        float result = -1; Sessions = 0; Matched = 0;
        try
        {
            var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
            IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
            var iid = typeof(IAudioSessionManager2).GUID; object o;
            dev.Activate(ref iid, 23, IntPtr.Zero, out o);
            var mgr = (IAudioSessionManager2)o;
            IAudioSessionEnumerator se; mgr.GetSessionEnumerator(out se);
            int n; se.GetCount(out n); Sessions = n;
            HashSet<int> tree = null; var ctx = Guid.Empty;
            for (int i = 0; i < n; i++)
            {
                IAudioSessionControl2 c; se.GetSession(i, out c);
                uint pid; c.GetProcessId(out pid);
                if (tree == null) tree = Tree(rootPid);
                if (!tree.Contains((int)pid)) continue;
                Matched++;
                var v = (ISimpleAudioVolume)c;
                if (set.HasValue) v.SetMasterVolume(Math.Max(0f, Math.Min(1f, set.Value)), ref ctx);
                float cur; v.GetMasterVolume(out cur); result = cur;
            }
        }
        catch (Exception ex) { LastErr = ex.GetType().Name + ": " + ex.Message; }
        return result;
    }
}

static class Program
{
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int cx, uint f);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int v, int size);

    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static readonly object OutLock = new object();
    static StreamWriter Out; static StreamReader In;
    static bool? lastAuthed; static float? desiredVol; static float lastVol = -2; static string lastDbg; static bool embedMode;
    static Form form; static WebView2 view; static IntPtr owner;
    static readonly string[] Allowed = {
        "spotify.com", "scdn.co", "spotifycdn.com", "spotify.link", "accounts.google.com", "google.com", "gstatic.com",
        "facebook.com", "fbcdn.net", "apple.com", "recaptcha.net", "hcaptcha.com", "cloudflare.com", "googleapis.com"
    };

    static void Emit(string ev, string k = null, object v = null)
    {
        var o = new Dictionary<string, object> { { "ev", ev } };
        if (k != null) o[k] = v;
        lock (OutLock) { Out.WriteLine(Json.Serialize(o)); Out.Flush(); }
    }

    static string EmbedHtml(string uri)
    {
        var u = Json.Serialize(uri.StartsWith("spotify:") ? uri : "");
        return "<!doctype html><meta charset=utf-8><body style='margin:0;background:#121212'><div id=p></div><script>" +
            "const post=m=>chrome.webview.postMessage(m);let C=null;" +
            "window.onSpotifyIframeApiReady=A=>{A.createController(document.getElementById('p'),{uri:" + u + ",width:'100%',height:152},c=>{C=c;" +
            "c.addListener('ready',()=>post({t:'ready'}));" +
            "c.addListener('playback_update',e=>post({t:'state',d:e.data}));" +
            "c.addListener('playback_started',e=>post({t:'started',d:e.data}));});};" +
            "chrome.webview.addEventListener('message',e=>{const m=e.data;if(!C)return;" +
            "if(m.what=='play')C.play();else if(m.what=='pause')C.pause();else if(m.what=='toggle')C.togglePlay();" +
            "else if(m.what=='seek')C.seek(+m.sec||0);else if(m.what=='load')C.loadUri(String(m.uri));});" +
            "</script><script src='https://open.spotify.com/embed/iframe-api/v1' async></script>";
    }

    static bool HostOk(string url)
    {
        Uri u;
        if (!Uri.TryCreate(url, UriKind.Absolute, out u) || u.Scheme != "https") return false;
        foreach (var d in Allowed) if (u.Host == d || u.Host.EndsWith("." + d)) return true;
        return false;
    }

    [STAThread]
    static void Main(string[] args)
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        Out = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        In = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        long ownerVal = 0; string profile = null;
        for (int i = 0; i + 1 < args.Length; i += 2)
        {
            if (args[i] == "--owner") long.TryParse(args[i + 1], out ownerVal);
            else if (args[i] == "--profile") profile = args[i + 1];
        }
        owner = new IntPtr(ownerVal);
        if (string.IsNullOrEmpty(profile)) profile = Path.Combine(Path.GetTempPath(), "music-island-spotify");
        Application.EnableVisualStyles();

        form = new Form
        {
            FormBorderStyle = FormBorderStyle.None, ShowInTaskbar = false, TopMost = true,
            StartPosition = FormStartPosition.Manual, Bounds = new Rectangle(-32000, -32000, 420, 600),
            BackColor = Color.FromArgb(18, 18, 18), Text = "Music Island: Spotify"
        };
        view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(18, 18, 18) };
        var bar = new Panel { Dock = DockStyle.Top, Height = 30, BackColor = Color.FromArgb(18, 18, 18) };
        var cap = new Label { Text = "Spotify", ForeColor = Color.FromArgb(179, 179, 179), AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(12, 0, 0, 0), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        var close = new Button { Text = "✕", Dock = DockStyle.Right, Width = 44, FlatStyle = FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(18, 18, 18), Cursor = Cursors.Hand, TabStop = false };
        close.FlatAppearance.BorderSize = 0;
        close.FlatAppearance.MouseOverBackColor = Color.FromArgb(232, 17, 35);
        close.Click += (s2, e2) => { form.Hide(); Emit("hidden"); };
        bar.Controls.Add(cap); bar.Controls.Add(close);
        form.Controls.Add(view);
        form.Controls.Add(bar);
        form.Controls.SetChildIndex(view, 0);
        form.HandleCreated += (s, e) =>
        {
            if (owner != IntPtr.Zero) SetWindowLongPtr(form.Handle, -8, owner); // GWLP_HWNDPARENT: владелец
            int round = 2; DwmSetWindowAttribute(form.Handle, 33, ref round, 4);  // скруглённые углы (Windows 11)
        };
        form.FormClosing += (s, e) =>
        {
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; form.Hide(); Emit("hidden"); }
        };
        form.Load += (s, e) => { };
        form.Show(); // WebView2 рисует только в показанном окне: показываем за пределами экрана, пока нет команды show

        InitWeb(profile);
        new Thread(ReadCommands) { IsBackground = true }.Start();
        new Thread(WatchOwner) { IsBackground = true }.Start();
        Application.Run();
    }

    static async void InitWeb(string profile)
    {
        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null, profile, new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required --app-user-model-id=MusicIsland.Spotify"));
            await view.EnsureCoreWebView2Async(env);
            var c = view.CoreWebView2;
            c.Settings.AreDevToolsEnabled = false;
            c.Settings.IsStatusBarEnabled = false;
            c.Settings.IsGeneralAutofillEnabled = false;
            c.Settings.IsPasswordAutosaveEnabled = false;
            // Окна-вкладки (вход через соцсети) открываем в этом же плеере, чужие сайты передаём браузеру по умолчанию
            c.NewWindowRequested += (s, e) =>
            {
                e.Handled = true;
                if (HostOk(e.Uri)) c.Navigate(e.Uri); else OpenExternal(e.Uri);
            };
            c.NavigationStarting += (s, e) =>
            {
                if (!HostOk(e.Uri) && !e.Uri.StartsWith("about:") && !(embedMode && e.Uri.StartsWith("data:text/html"))) { e.Cancel = true; OpenExternal(e.Uri); }
            };
            c.WebMessageReceived += (s, e) =>
            {
                if (!embedMode) return; // сообщения принимаем только от нашей страницы-вставки
                try { Emit("embed", "data", Json.DeserializeObject(e.WebMessageAsJson)); } catch { }
            };
            c.DocumentTitleChanged += (s, e) => Emit("title", "title", c.DocumentTitle);
            c.NavigationCompleted += (s, e) => Emit("loaded");
            c.SourceChanged += (s, e) => Emit("url", "url", c.Source);
            c.ProcessFailed += (s, e) => Emit("error", "msg", "Процесс веб-плеера завершился: " + e.ProcessFailedKind);
            c.Navigate("https://open.spotify.com/");
            var rd = new Dictionary<string, object> { { "ev", "ready" }, { "pid", Process.GetCurrentProcess().Id }, { "browserPid", (int)c.BrowserProcessId } };
            lock (OutLock) { Out.WriteLine(Json.Serialize(rd)); Out.Flush(); }
            // признак входа: только наличие cookie sp_dc, значение никуда не передаётся
            var t = new System.Windows.Forms.Timer { Interval = 1000 };
            t.Tick += async (s2, e2) =>
            {
                try
                {
                    var cookies = await c.CookieManager.GetCookiesAsync("https://open.spotify.com");
                    bool authed = cookies.Exists(k => k.Name == "sp_dc");
                    if (authed != lastAuthed) { lastAuthed = authed; Emit("auth", "authed", authed); }
                    float cur = WinAudio.Apply(Process.GetCurrentProcess().Id, desiredVol);
                    string dbg = WinAudio.LastErr + "|" + WinAudio.Sessions + "|" + WinAudio.Matched;
                    if (dbg != lastDbg) { lastDbg = dbg; Emit("audiodbg", "d", dbg); }
                    if (cur >= 0 && Math.Abs(cur - lastVol) > 0.005f) { lastVol = cur; Emit("volume", "v", Math.Round(cur, 2)); }
                }
                catch { }
            };
            t.Start();
        }
        catch (Exception ex)
        {
            Emit("error", "msg", ex is WebView2RuntimeNotFoundException ? "noruntime" : ex.Message);
        }
    }

    static void OpenExternal(string url)
    {
        Uri u;
        if (Uri.TryCreate(url, UriKind.Absolute, out u) && u.Scheme == "https")
            Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true });
    }

    static void ReadCommands()
    {
        string line;
        while ((line = In.ReadLine()) != null)
        {
            Dictionary<string, object> o;
            try { o = Json.Deserialize<Dictionary<string, object>>(line); } catch { continue; }
            form.BeginInvoke((Action)(() => Handle(o)));
        }
        form.BeginInvoke((Action)(() => Application.Exit()));
    }

    static int N(Dictionary<string, object> o, string k)
    {
        object v;
        return o.TryGetValue(k, out v) && v != null ? Convert.ToInt32(v) : 0;
    }

    static async void Handle(Dictionary<string, object> o)
    {
        switch ((string)o["cmd"])
        {
            case "show": // x, y, w, h в физических пикселях экрана
                form.Bounds = new Rectangle(N(o, "x"), N(o, "y"), N(o, "w"), N(o, "h"));
                SetWindowPos(form.Handle, new IntPtr(-1), form.Left, form.Top, form.Width, form.Height, 0x0010 | 0x0040); // NOACTIVATE | SHOWWINDOW
                Emit("shown");
                break;
            case "hide":
                form.Hide(); Emit("hidden");
                break;
            case "focus":
                form.Activate(); view.Focus();
                break;
            case "volume": // 0..1: громкость звуковой сессии веб-плеера в Windows (точная и читаемая)
                desiredVol = (float)Convert.ToDouble(o["v"]);
                break;
            case "nav": // только страницы open.spotify.com
                {
                    string u = o.ContainsKey("url") ? (string)o["url"] : "";
                    Uri uu; embedMode = false;
                    if (view.CoreWebView2 != null && Uri.TryCreate(u, UriKind.Absolute, out uu) && uu.Scheme == "https" && uu.Host == "open.spotify.com") view.CoreWebView2.Navigate(u);
                }
                break;
            case "click": // нажатие мышью в точке страницы (x, y в пикселях страницы)
                if (view.CoreWebView2 != null)
                {
                    double cx = Convert.ToDouble(o["x"]), cy = Convert.ToDouble(o["y"]);
                    foreach (var t in new[] { "mouseMoved", "mousePressed", "mouseReleased" })
                    {
                        var j = Json.Serialize(new Dictionary<string, object> { { "type", t }, { "x", cx }, { "y", cy }, { "button", "left" }, { "buttons", t == "mousePressed" ? 1 : 0 }, { "clickCount", t == "mouseMoved" ? 0 : 1 } });
                        await view.CoreWebView2.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", j);
                    }
                }
                break;
            case "queue": // чтение панели очереди через дерево доступности (только чтение, без скриптов в странице)
                if (view.CoreWebView2 != null)
                {
                    object items = null;
                    try { items = await ReadQueue(); } catch (Exception ex) { Emit("error", "msg", "queue: " + ex.Message); }
                    var qd = new Dictionary<string, object> { { "ev", "queue" }, { "id", o.ContainsKey("id") ? o["id"] : null }, { "items", items } };
                    lock (OutLock) { Out.WriteLine(Json.Serialize(qd)); Out.Flush(); }
                }
                break;
            case "queueplay": // нажать кнопку Play у строки очереди (узел DOM из прошлого чтения)
                if (view.CoreWebView2 != null) await QueuePlay(N(o, "n"));
                break;
            case "home":
                embedMode = false;
                if (view.CoreWebView2 != null) view.CoreWebView2.Navigate("https://open.spotify.com/");
                break;
            case "logout": // выход из аккаунта: куки, хранилище и кэш профиля
                if (view.CoreWebView2 != null)
                {
                    await view.CoreWebView2.Profile.ClearBrowsingDataAsync();
                    view.CoreWebView2.Navigate("https://open.spotify.com/");
                    lastAuthed = null;
                    Emit("loggedout");
                }
                break;
            case "quit":
                Application.Exit();
                break;
        }
    }

    static async System.Threading.Tasks.Task<string> Cdp(string method, object args)
    {
        return await view.CoreWebView2.CallDevToolsProtocolMethodAsync(method, Json.Serialize(args ?? new Dictionary<string, object>()));
    }

    static string AxName(Dictionary<string, object> n)
    {
        object nm; if (!n.TryGetValue("name", out nm) || nm == null) return "";
        object v; return ((Dictionary<string, object>)nm).TryGetValue("value", out v) && v != null ? v.ToString() : "";
    }
    static string AxRole(Dictionary<string, object> n)
    {
        object r; if (!n.TryGetValue("role", out r) || r == null) return "";
        object v; return ((Dictionary<string, object>)r).TryGetValue("value", out v) && v != null ? v.ToString() : "";
    }

    // Очередь Spotify из дерева доступности страницы /queue: строки таблицы в main (название, исполнитель, длительность)
    // Очередь живёт в правой панели страницы. Если она закрыта, нажимаем кнопку очереди на панели плеера
    // (переход по адресу перезагрузил бы страницу и остановил музыку). Кнопка — четвёртая с конца перед ползунком громкости:
    // очередь, устройства, звук, громкость; так она находится без привязки к языку интерфейса.
    static async System.Threading.Tasks.Task<object> ReadQueue()
    {
        var first = (List<Dictionary<string, object>>)await ReadQueueOnce(false);
        if (first == null) { await System.Threading.Tasks.Task.Delay(500); first = (List<Dictionary<string, object>>)await ReadQueueOnce(false); } // панель могла ещё дорисовываться
        if (first != null) return first;
        int qb = await FindBarButton("queue");
        if (qb <= 0) throw new Exception("кнопка очереди не найдена");
        await QueuePlay(qb);
        for (int i = 0; i < 4; i++) // после нажатия панель появляется не сразу; второй раз кнопку не нажимаем
        {
            await System.Threading.Tasks.Task.Delay(500);
            var r = (List<Dictionary<string, object>>)await ReadQueueOnce(false);
            if (r != null) return r;
        }
        return new List<Dictionary<string, object>>();
    }

    // Кнопка очереди на панели плеера. Опора — структура, а не названия: справа от прогресса [очередь, устройства, звук, ползунок громкости]
    static async System.Threading.Tasks.Task<int> FindBarButton(string what)
    {
        var ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 100000 };
        var root = ser.Deserialize<Dictionary<string, object>>(await Cdp("Accessibility.getFullAXTree", null));
        var byId = new Dictionary<string, Dictionary<string, object>>();
        foreach (Dictionary<string, object> n in (System.Collections.IEnumerable)root["nodes"]) byId[(string)n["nodeId"]] = n;
        var flat = new List<Dictionary<string, object>>();
        Action<Dictionary<string, object>> walk = null;
        walk = n =>
        {
            flat.Add(n); object c;
            if (n.TryGetValue("childIds", out c) && c != null)
                foreach (object id in (System.Collections.IEnumerable)c) { Dictionary<string, object> k; if (byId.TryGetValue((string)id, out k)) walk(k); }
        };
        // Панель плеера — область (complementary) с двумя ползунками: позиция трека и громкость.
        // Ползунки изменения размера панелей в другие области не входят, поэтому «последний ползунок страницы» брать нельзя.
        foreach (var n in byId.Values)
        {
            if (AxRole(n) != "complementary") continue;
            flat.Clear(); walk(n);
            int sliders = 0; foreach (var f in flat) if (AxRole(f) == "slider") sliders++;
            if (sliders >= 2) break;
            flat.Clear();
        }
        int anchor = -1; string anchorRole = what == "queue" ? "slider" : "checkbox"; int need = what == "queue" ? 3 : what == "shuffle" ? 4 : 5;
        for (int i = flat.Count - 1; i >= 0; i--) if (AxRole(flat[i]) == anchorRole) { anchor = i; break; }
        if (anchor < 0) return 0;
        int found = 0;
        for (int i = anchor - 1; i >= 0; i--)
            if (AxRole(flat[i]) == "button" && flat[i].ContainsKey("backendDOMNodeId")) { found++; if (found == need) return Convert.ToInt32(flat[i]["backendDOMNodeId"]); }
        return 0;
    }

    static async System.Threading.Tasks.Task<object> ReadQueueOnce(bool final)
    {
        await Cdp("Accessibility.enable", null);
        var ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 100000 };
        var root = ser.Deserialize<Dictionary<string, object>>(await Cdp("Accessibility.getFullAXTree", null));
        var byId = new Dictionary<string, Dictionary<string, object>>();
        foreach (Dictionary<string, object> n in (System.Collections.IEnumerable)root["nodes"]) byId[(string)n["nodeId"]] = n;
        Func<Dictionary<string, object>, List<Dictionary<string, object>>> kids = n =>
        {
            var l = new List<Dictionary<string, object>>(); object c;
            if (n.TryGetValue("childIds", out c) && c != null)
                foreach (object id in (System.Collections.IEnumerable)c) { Dictionary<string, object> k; if (byId.TryGetValue((string)id, out k)) l.Add(k); }
            return l;
        };
        Func<Dictionary<string, object>, string, Dictionary<string, object>> find = null;
        find = (n, role) =>
        {
            foreach (var k in kids(n)) { if (AxRole(k) == role) return k; var r = find(k, role); if (r != null) return r; }
            return null;
        };
        // Панель очереди: первая таблица (treegrid) — «Сейчас играет», вторая — «Далее»
        var grids = new List<Dictionary<string, object>>();
        Action<Dictionary<string, object>> collectGrids = null;
        collectGrids = n => { foreach (var k in kids(n)) { if (AxRole(k) == "treegrid") grids.Add(k); else collectGrids(k); } };
        foreach (var n in byId.Values) if (AxRole(n) == "RootWebArea") { collectGrids(n); break; }
        var items = new List<Dictionary<string, object>>();
        if (grids.Count < 1) return final ? (object)items : null; // нет таблиц — панель очереди закрыта
        if (grids.Count < 2) return items; // панель открыта, «Далее» нет — очередь пуста
        var rows = new List<Dictionary<string, object>>();
        Action<Dictionary<string, object>> collectRows = null;
        collectRows = n => { foreach (var k in kids(n)) { if (AxRole(k) == "row") rows.Add(k); else collectRows(k); } };
        for (int gi = 1; gi < grids.Count; gi++) collectRows(grids[gi]); // «Далее в очереди» и «Далее из: …» — это отдельные таблицы
        foreach (var row in rows)
        {
            var buttons = new List<Dictionary<string, object>>(); var links = new List<string>();
            var st = new Stack<Dictionary<string, object>>(); st.Push(row);
            while (st.Count > 0)
            {
                var c = st.Pop(); var role = AxRole(c);
                if (role == "button") buttons.Add(c);
                else if (role == "link" && AxName(c) != "") links.Add(AxName(c));
                var ks = kids(c); for (int i = ks.Count - 1; i >= 0; i--) st.Push(ks[i]); // обход в порядке документа
            }
            if (buttons.Count < 2 || !buttons[1].ContainsKey("backendDOMNodeId")) continue; // [0] — вся строка, [1] — кнопка Play
            items.Add(new Dictionary<string, object> { { "title", AxName(row) }, { "artists", string.Join(", ", links.ToArray()) }, { "dur", 0 }, { "n", Convert.ToInt32(buttons[1]["backendDOMNodeId"]) } });
            if (items.Count >= 50) break;
        }
        return items;
    }

    static async System.Threading.Tasks.Task QueuePlay(int node)
    {
        if (node <= 0) return;
        await Cdp("DOM.enable", null);
        await Cdp("DOM.scrollIntoViewIfNeeded", new Dictionary<string, object> { { "backendNodeId", node } });
        var ser = new JavaScriptSerializer();
        var box = ser.Deserialize<Dictionary<string, object>>(await Cdp("DOM.getBoxModel", new Dictionary<string, object> { { "backendNodeId", node } }));
        var q = ((System.Collections.IList)((Dictionary<string, object>)box["model"])["content"]);
        double x = (Convert.ToDouble(q[0]) + Convert.ToDouble(q[4])) / 2, y = (Convert.ToDouble(q[1]) + Convert.ToDouble(q[5])) / 2;
        foreach (var t in new[] { "mouseMoved", "mousePressed", "mouseReleased" })
            await Cdp("Input.dispatchMouseEvent", new Dictionary<string, object> { { "type", t }, { "x", x }, { "y", y }, { "button", "left" }, { "buttons", t == "mousePressed" ? 1 : 0 }, { "clickCount", t == "mouseMoved" ? 0 : 1 } });
    }

    static void WatchOwner()
    {
        if (owner == IntPtr.Zero) return;
        uint pid; GetWindowThreadProcessId(owner, out pid);
        try { Process.GetProcessById((int)pid).WaitForExit(); } catch { }
        form.BeginInvoke((Action)(() => Application.Exit()));
    }
}
