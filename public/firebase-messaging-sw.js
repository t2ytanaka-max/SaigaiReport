importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDfDCyM8Ij-61hiGQnZlhfag_d6zJbHNyc",
  authDomain: "live-saigai-report.firebaseapp.com",
  projectId: "live-saigai-report",
  storageBucket: "live-saigai-report.firebasestorage.app",
  messagingSenderId: "418959728754",
  appId: "1:418959728754:web:9bb7f856ef95bd52cf22eb"
});

const messaging = firebase.messaging();

// バックグラウンド通知のハンドリング
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/pwa-192x192.png',
    data: payload.data, // クリック時の遷移先URLなどを保持可能
    tag: 'saigai-report-notification', // 同じタグの通知は上書きされる
    renotify: true, // 上書き時も音を鳴らす
    vibrate: [200, 100, 200] // バイブレーションパターン
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
