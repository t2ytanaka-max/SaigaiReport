import React, { useState, useEffect } from 'react';
import { messaging, db_fs } from '../lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Bell, BellRing, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { getMyDeviceId } from '../lib/notifications';

const VAPID_KEY = "BCMDZV8NR5rK66evN_3yUP16EPBYF0oQfa-DYjuWl9ZcS_4UDMv6K2l9N0bZrLcIP67YpL2MsBRaU1MF7mqNK2g";

export default function PushNotificationManager() {
    const [permission, setPermission] = useState(Notification.permission);
    const [showBanner, setShowBanner] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, requesting, success, error
    const myId = getMyDeviceId();

    useEffect(() => {
        // すでに許可されている場合はトークンを取得・更新
        if (Notification.permission === 'granted') {
            handleRequestPermission();
        } else if (Notification.permission === 'default') {
            // まだ未設定の場合は3秒後に案内バナーを表示
            const timer = setTimeout(() => setShowBanner(true), 3000);
            return () => clearTimeout(timer);
        }
    }, []);

    // フォアグラウンド（アプリが開いている時）のメッセージ受信
    useEffect(() => {
        if (!messaging) return;
        const unsubscribe = onMessage(messaging, (payload) => {
            console.log('Foreground message received: ', payload);
            // 既に NotificationManager.jsx があるため、ここではログのみ出力
            // 必要に応じてトースト通知などを出すことも可能
        });
        return () => unsubscribe();
    }, []);

    const handleRequestPermission = async () => {
        if (!messaging) return;
        setStatus('requesting');
        
        try {
            const currentPermission = await Notification.requestPermission();
            setPermission(currentPermission);
            
            if (currentPermission === 'granted') {
                const token = await getToken(messaging, { 
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: await navigator.serviceWorker.ready
                });
                
                if (token) {
                    console.log('FCM Token acquired');
                    // Firestore にトークンを保存
                    await setDoc(doc(db_fs, "fcm_tokens", myId), {
                        token: token,
                        deviceId: myId,
                        platform: navigator.userAgent.includes('iPhone') ? 'iOS' : 'Android/Desktop',
                        updatedAt: serverTimestamp()
                    });
                    setStatus('success');
                    setShowBanner(false);
                }
            } else {
                setStatus('error');
            }
        } catch (err) {
            console.error('An error occurred while retrieving token. ', err);
            setStatus('error');
        }
    };

    if (!showBanner && permission !== 'default') return null;

    return (
        <div className="fixed bottom-24 left-4 right-4 z-[100] animate-in slide-in-from-bottom-full duration-500">
            <div className="bg-white rounded-3xl shadow-2xl border-2 border-blue-100 p-5 flex flex-col gap-4 overflow-hidden relative">
                <div className="flex justify-between items-start">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                            <BellRing className="text-blue-600 animate-bounce" size={24} />
                        </div>
                        <div>
                            <h4 className="font-black text-gray-900 text-lg leading-tight mb-1">
                                災害時プッシュ通知
                            </h4>
                            <p className="text-xs text-gray-500 font-bold leading-relaxed">
                                アプリを閉じていても、現場の緊急報告やLIVE配信の開始を音と振動で知らせます。
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setShowBanner(false)} className="text-gray-400 p-1">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    <Button 
                        onClick={handleRequestPermission}
                        disabled={status === 'requesting'}
                        className={`w-full h-12 rounded-xl font-black transition-all ${
                            status === 'success' ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                        }`}
                    >
                        {status === 'requesting' ? '設定中...' : 
                         status === 'success' ? (
                             <span className="flex items-center gap-2"><CheckCircle2 size={18} /> 通知を有効にしました</span>
                         ) : '通知を有効にする'}
                    </Button>
                    
                    {navigator.userAgent.includes('iPhone') && (
                        <p className="text-[10px] text-red-500 font-black text-center bg-red-50 py-2 rounded-lg">
                            ※iPhoneは「ホーム画面に追加」して使用する必要があります。
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
