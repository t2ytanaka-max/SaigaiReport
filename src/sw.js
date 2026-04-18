import { precacheAndRoute } from 'workbox-precaching';

// Vite PWA プラグインがビルド時にキャッシュ対象のファイルリストを注入します
precacheAndRoute(self.__WB_MANIFEST);

// Firebase FCM ライブラリのインポート（バックグラウンド処理用）
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Firebaseの初期化（config.jsと同じ設定）
firebase.initializeApp({
  apiKey: "AIzaSyDfDCyM8Ij-61hiGQnZlhfag_d6zJbHNyc",
  authDomain: "live-saigai-report.firebaseapp.com",
  projectId: "live-saigai-report",
  storageBucket: "live-saigai-report.firebasestorage.app",
  messagingSenderId: "418959728754",
  appId: "1:418959728754:web:9bb7f856ef95bd52cf22eb"
});

const messaging = firebase.messaging();

// FCM SDK が notification ペイロードをもとに「自動で完璧な通知」を出してくれるため、
// アプリ側では余計な出し直しをしないように整理します（2重通知の防止）
messaging.onBackgroundMessage((payload) => {
  console.log('[src/sw.js] 自動送信システムから通知を受信しました: ', payload);
});

