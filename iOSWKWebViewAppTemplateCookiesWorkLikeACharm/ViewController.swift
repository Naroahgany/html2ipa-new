//
//  ViewController.swift
//  iOSWKWebViewAppTemplateCookiesWorkLikeACharm
//
//  Kingfall Pure Edition: 纯净版
//  仅包含：WebView加载、Cookie持久化、全屏适配
//  不包含：任何原生音频控制代码
//

import UIKit
import WebKit

// 👇👇👇【此 URL 将在构建时被动态替换】👇👇👇
let myTargetUrl = "https://example.com"
// 👆👆👆【用户通过前端界面输入的网址会替换此处】👆👆👆

class ViewController: UIViewController {
    
    private let webView = WKWebView(frame: .zero)
    
    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .default
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        
        setupWebView()
    }
    
    func setupWebView() {
        view.backgroundColor = .systemBackground
        
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        
        self.view.addSubview(self.webView)
        
        NSLayoutConstraint.activate([
            self.webView.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
            self.webView.bottomAnchor.constraint(equalTo: self.view.bottomAnchor),
            self.webView.trailingAnchor.constraint(equalTo: self.view.trailingAnchor),
            self.webView.topAnchor.constraint(equalTo: self.view.topAnchor),
        ])
        
        if let url = URL(string: myTargetUrl) {
            let request = URLRequest(url: url)
            webView.load(request)
            
            webView.uiDelegate = self
            webView.navigationDelegate = self
            
            // 基础配置：允许内联播放（防止全屏弹出），但不涉及原生音频会话
            webView.configuration.allowsInlineMediaPlayback = true
            
            // 注入 Viewport 适配 (解决刘海屏遮挡和黑边问题)
            let source: String = "var meta = document.createElement('meta');" +
                "meta.name = 'viewport';" +
                "meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';" +
                "var head = document.getElementsByTagName('head')[0];" +
                "head.appendChild(meta);"
            
            let script: WKUserScript = WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            webView.configuration.userContentController.addUserScript(script)
        }
    }
}

// Cookie 保持逻辑 (完整保留，确保登录状态不丢失)
extension WKWebView {
    enum PrefKey { static let cookie = "cookies" }
    
    func writeDiskCookies(for domain: String, completion: @escaping () -> ()) {
        fetchInMemoryCookies(for: domain) { data in
            UserDefaults.standard.setValue(data, forKey: PrefKey.cookie + domain)
            completion();
        }
    }
    
    func loadDiskCookies(for domain: String, completion: @escaping () -> ()) {
        if let diskCookie = UserDefaults.standard.dictionary(forKey: (PrefKey.cookie + domain)){
            fetchInMemoryCookies(for: domain) { freshCookie in
                let mergedCookie = diskCookie.merging(freshCookie) { (_, new) in new }
                for (_, cookieConfig) in mergedCookie {
                    let cookie = cookieConfig as! Dictionary<String, Any>
                    var expire : Any? = nil
                    if let expireTime = cookie["Expires"] as? Double{
                        expire = Date(timeIntervalSinceNow: expireTime)
                    }
                    let newCookie = HTTPCookie(properties: [
                        .domain: cookie["Domain"] as Any,
                        .path: cookie["Path"] as Any,
                        .name: cookie["Name"] as Any,
                        .value: cookie["Value"] as Any,
                        .secure: cookie["Secure"] as Any,
                        .expires: expire as Any
                    ])
                    if let validCookie = newCookie {
                        self.configuration.websiteDataStore.httpCookieStore.setCookie(validCookie)
                    }
                }
                completion()
            }
        } else {
            completion()
        }
    }
    
    func fetchInMemoryCookies(for domain: String, completion: @escaping ([String: Any]) -> ()) {
        var cookieDict = [String: AnyObject]()
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { (cookies) in
            for cookie in cookies {
                if cookie.domain.contains(domain) {
                    cookieDict[cookie.name] = cookie.properties as AnyObject?
                }
            }
            completion(cookieDict)
        }
    }
}

let url = URL(string: myTargetUrl)!

extension ViewController: WKUIDelegate, WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let host = url.host {
            webView.loadDiskCookies(for: host){ decisionHandler(.allow) }
        } else { decisionHandler(.allow) }
    }
    
    public func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let host = url.host {
            webView.writeDiskCookies(for: host){ decisionHandler(.allow) }
        } else { decisionHandler(.allow) }
    }
}
