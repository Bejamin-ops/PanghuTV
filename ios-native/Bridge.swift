import Foundation
import WebKit
import UIKit

/// JS↔原生桥：
/// - panghuHttp: {id, url, headers} → URLSession GET → __panghuHttpCbB64('<b64({id,ok,body|error|code})>')
/// - panghuPlay: {url, kernel} → KernelManager 调起原生播放内核
final class WebBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private weak var root: UIViewController?
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 20
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: c)
    }()

    static let bootstrapJS = """
    window.__panghuHttpCbs={};window.__panghuHttpCbB64=function(b64){var bin=atob(b64);var bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);var txt=new TextDecoder('utf-8').decode(bytes);var r=JSON.parse(txt);var f=window.__panghuHttpCbs[r.id];if(f){try{f(r);}catch(e){}}};window.__PANGHU_NATIVE__=true;
    """

    func attach(webView: WKWebView, root: UIViewController) {
        self.webView = webView
        self.root = root
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        switch message.name {
        case "panghuHttp": handleHTTP(body)
        case "panghuPlay": handlePlay(body)
        default: break
        }
    }

    private func handleHTTP(_ body: [String: Any]) {
        let id = body["id"] as? String ?? ""
        guard let urlStr = body["url"] as? String, let url = URL(string: urlStr) else {
            respond(id: id, dict: ["id": id, "ok": false, "error": "bad url"])
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        if let hs = body["headers"] as? [String: String] {
            for (k, v) in hs { req.setValue(v, forHTTPHeaderField: k) }
        }
        session.dataTask(with: req) { [weak self] data, resp, err in
            guard let self = self else { return }
            if let err = err {
                self.respond(id: id, dict: ["id": id, "ok": false, "error": err.localizedDescription])
                return
            }
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            guard let data = data, (200..<300).contains(code) else {
                self.respond(id: id, dict: ["id": id, "ok": false, "code": code])
                return
            }
            let text = String(data: data, encoding: .utf8) ?? ""
            self.respond(id: id, dict: ["id": id, "ok": true, "body": text])
        }.resume()
    }

    private func respond(id: String, dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return }
        let js = "__panghuHttpCbB64('\(data.base64EncodedString())')"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func handlePlay(_ body: [String: Any]) {
        let url = body["url"] as? String ?? ""
        let kernel = body["kernel"] as? String ?? "builtin"
        DispatchQueue.main.async {
            KernelManager.shared.play(url: url, kernel: kernel, from: self.root)
        }
    }
}
