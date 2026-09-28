import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let bg = UIColor(red: 0.043, green: 0.055, blue: 0.078, alpha: 1) // #0b0e14
        let win = UIWindow(frame: UIScreen.main.bounds)
        win.backgroundColor = bg

        let vc = UIViewController()
        vc.view.backgroundColor = bg

        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.allowsPictureInPictureMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 16.4, *) {
            cfg.preferences.isElementFullscreenEnabled = true
        }
        let ucc = WKUserContentController()
        let bridge = WebBridge()
        ucc.add(bridge, name: "panghuHttp")
        ucc.add(bridge, name: "panghuPlay")
        ucc.addUserScript(WKUserScript(source: WebBridge.bootstrapJS,
                                       injectionTime: .atDocumentStart,
                                       forMainFrameOnly: false))
        cfg.userContentController = ucc

        let wv = WKWebView(frame: vc.view.bounds, configuration: cfg)
        wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        wv.backgroundColor = bg
        wv.isOpaque = false
        wv.scrollView.backgroundColor = bg
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.contentInset = .zero
        wv.scrollView.scrollIndicatorInsets = .zero
        wv.scrollView.bounces = false
        vc.view.addSubview(wv)

        bridge.attach(webView: wv, root: vc)

        win.rootViewController = vc
        window = win
        win.makeKeyAndVisible()

        wv.evaluateJavaScript("navigator.userAgent") { ua, _ in
            guard let ua = ua as? String else { return }
            wv.customUserAgent = ua + " DanDanTV/1.0"
            if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
                wv.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            }
        }
        return true
    }

    func application(_ application: UIApplication,
                     supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return [.portrait, .landscapeLeft, .landscapeRight]
    }
}
