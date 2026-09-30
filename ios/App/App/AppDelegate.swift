import UIKit
import Capacitor
import KakaoSDKAuth
import KakaoSDKCommon
import FirebaseCore
import FirebaseMessaging

// 서버(push-dispatch edge function)는 FCM 토큰만 이해한다. Firebase 초기화가 없으면
// Capacitor push-notifications 플러그인은 순수 APNs 토큰(hex)을 그대로 넘기고, 그걸
// FCM으로 보내면 조용히 실패한다(2026-09-30, 123@123.123 iOS 테스트에서 발견 — DB엔
// 토큰이 저장되는데 알림이 안 옴). FirebaseApp.configure() + Messaging.apnsToken 대입으로
// APNs 토큰을 FCM 토큰으로 바꾸고, 그 FCM 토큰을 capacitorDidRegisterForRemoteNotifications로
// 다시 쏴서 JS 쪽(pushNotifications.ts)은 코드 변경 없이 그대로 동작하게 한다.
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?
    // Firebase가 didReceiveRegistrationToken을 앱 시작 "즉시"(WebView가 아직 안 뜬 시점)
    // 캐시된 토큰으로 먼저 한 번 호출한다 — 이때 JS 쪽 PushNotifications.addListener는
    // 아직 안 붙어 있어(pushNotifications.ts가 3초 뒤 register 호출) 이벤트가 버려진다.
    // 그 뒤 register()를 다시 불러도 FCM SDK는 "이미 같은 토큰을 알려줬다"고 보고
    // 콜백을 재발사하지 않는다(2026-09-30 실측 — 두 번째 register 이후 영원히 무응답).
    // 그래서 마지막 토큰을 여기 저장해뒀다가, JS가 register()를 다시 호출할 때마다
    // (아래 didRegisterForRemoteNotificationsWithDeviceToken에서) 그 값을 다시 쏴준다.
    private var lastFcmToken: String?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let kakaoAppKey = Bundle.main.infoDictionary?["KAKAO_APP_KEY"] as? String,
           !kakaoAppKey.isEmpty {
            KakaoSDK.initSDK(appKey: kakaoAppKey)
        }
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if AuthApi.isKakaoTalkLoginUrl(url) {
            return AuthController.handleOpenUrl(url: url)
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken

        // 이미 한 번 FCM 토큰을 받아본 적 있으면(lastFcmToken) 그 값을 여기서 바로
        // Capacitor에 재발사한다 — didReceiveRegistrationToken을 기다리지 않는다.
        // FCM SDK는 같은 토큰이면 콜백을 다시 안 불러주는데(2026-09-30 실측),
        // 이 메서드(JS의 register() 호출 → UIApplication.registerForRemoteNotifications())는
        // 앱이 재시작·재로그인할 때마다 새로 불린다 — 그때마다 JS 쪽 리스너가 이미
        // 붙어 있는 상태이므로, 캐시된 토큰이라도 다시 흘려보내야 DB에 저장된다.
        if let cached = lastFcmToken {
            NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: cached)
        }
    }

    // apnsToken 대입 직후(또는 토큰이 갱신될 때마다) 호출된다. 여기서 나오는 fcmToken이
    // 서버가 이해하는 FCM 토큰이다 — 이걸 Capacitor push-notifications의 registration
    // 이벤트로 그대로 흘려보내면 src/lib/native/pushNotifications.ts가 지금 코드 그대로
    // Supabase push_tokens에 FCM 토큰을 저장한다.
    //
    // object에 String을 그대로 넣는다 — Data로 넣으면 플러그인이 각 바이트를 "%02X"로
    // hex 인코딩해 버려서(PushNotificationsPlugin.swift의 Data 분기) FCM 토큰 문자열이
    // 깨진다. String 분기(같은 파일의 stringToken 분기)는 값을 그대로 통과시킨다.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken = fcmToken else { return }
        lastFcmToken = fcmToken
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: fcmToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push][Debug] APNs registration FAILED: \(error)")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
