import React, { useState, useEffect, useRef } from 'react';
import { db_fs } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, limit, where } from 'firebase/firestore';
import { Bell, BellOff, X, AlertTriangle, Radio, Settings2, Volume2, VolumeX } from 'lucide-react';
import { getMyDeviceId, getNotificationSettings, saveNotificationSettings } from '../lib/notifications';

const SOUND_URLS = {
    default: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', // ピンポーン
    alert: 'https://assets.mixkit.co/active_storage/sfx/950/950-preview.mp3',   // サイレン風
    smart: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'  // ピピッ
};

export default function NotificationManager() {
    const [notification, setNotification] = useState(null);
    const [settings, setSettings] = useState(getNotificationSettings());
    const [showSettings, setShowSettings] = useState(false);
    const [isAudioInitialized, setIsAudioInitialized] = useState(false);
    
    const myId = getMyDeviceId();
    const startTimeRef = useRef(Date.now());
    const processedIdsRef = useRef(new Set()); // 重複通知防止用

    // 設定変更の保存
    const updateSettings = (newSettings) => {
        const merged = { ...settings, ...newSettings };
        setSettings(merged);
        saveNotificationSettings(merged);
    };

    // 音声再生
    const playNotificationSound = () => {
        if (!settings.enabled || !isAudioInitialized) return;
        
        try {
            const audio = new Audio(SOUND_URLS[settings.soundType] || SOUND_URLS.default);
            audio.volume = settings.volume;
            audio.play().catch(e => console.error("Audio play failed:", e));
        } catch (e) {
            console.error("Audio instance failed:", e);
        }
    };

    // Firebase監視
    useEffect(() => {
        if (!db_fs) return;

        // 監視開始時に一瞬ラグを持たせる（初期ロードの大量データを避けるため）
        const watchStartTime = Date.now();

        // 1. 災害報告の監視
        const qReports = query(
            collection(db_fs, "reports"),
            orderBy("timestamp", "desc"),
            limit(1)
        );

        const unsubscribeReports = onSnapshot(qReports, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    const docId = change.doc.id;
                    
                    // 初期ロード時や、自分の投稿、以前のデータは無視
                    if (data.timestamp < watchStartTime || data.deviceId === myId || processedIdsRef.current.has(docId)) return;

                    processedIdsRef.current.add(docId);
                    showBanner({
                        type: 'report',
                        title: `${data.corp}が報告しました`,
                        content: data.memo || data.disasterType,
                        icon: <AlertTriangle className="text-red-500" size={20} />
                    });
                }
            });
        });

        // 2. LIVE配信の監視
        const qLive = query(
            collection(db_fs, "live_streams"),
            where("status", "==", "LIVE")
        );

        const unsubscribeLive = onSnapshot(qLive, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added" || (change.type === "modified" && change.doc.data().status === "LIVE")) {
                    const data = change.doc.data();
                    const docId = `live_${change.doc.id}_${data.timestamp}`;
                    
                    // 以前のデータや自分の配信は無視
                    if (data.timestamp < watchStartTime || data.deviceId === myId || processedIdsRef.current.has(docId)) return;

                    processedIdsRef.current.add(docId);
                    showBanner({
                        type: 'live',
                        title: `${data.corp}がLIVE配信を開始`,
                        content: '現場からの生中継が始まりました',
                        icon: <Radio className="text-blue-500 animate-pulse" size={20} />
                    });
                }
            });
        });

        return () => {
            unsubscribeReports();
            unsubscribeLive();
        };
    }, []);

    const showBanner = (notif) => {
        setNotification(notif);
        playNotificationSound();
        
        // 5秒後に自動で消す
        setTimeout(() => {
            setNotification(null);
        }, 6000);
    };

    // ブラウザの音声制限解除
    const initializeAudio = () => {
        setIsAudioInitialized(true);
        setShowSettings(false);
        // テスト再生
        const audio = new Audio(SOUND_URLS[settings.soundType]);
        audio.volume = 0.1;
        audio.play().catch(() => {});
    };

    return (
        <>
            {/* 通知バナー */}
            {notification && (
                <div className="fixed top-4 left-0 right-0 z-[9999] px-4 animate-in slide-in-from-top-full duration-500">
                    <div className="max-w-md mx-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-white flex items-stretch overflow-hidden ring-1 ring-black/5">
                        <div className={`w-2 ${notification.type === 'report' ? 'bg-red-500' : 'bg-blue-500'}`} />
                        <div className="flex-1 p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0 shadow-inner">
                                {notification.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-black text-sm text-gray-900 leading-none mb-1">{notification.title}</h4>
                                <p className="text-xs text-gray-500 font-bold truncate">{notification.content}</p>
                            </div>
                            <button 
                                onClick={() => setNotification(null)}
                                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 設定ボタン */}
            <div className="fixed bottom-24 right-4 z-[9998] flex flex-col items-end gap-3">
                {showSettings && (
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-5 w-64 mb-2 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <h5 className="font-black text-sm text-gray-900 tracking-widest uppercase">通知設定</h5>
                            <button onClick={() => setShowSettings(false)}><X size={16} className="text-gray-400" /></button>
                        </div>

                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-600">通知音を鳴らす</span>
                                <button 
                                    onClick={() => updateSettings({ enabled: !settings.enabled })}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.enabled ? 'bg-green-500' : 'bg-gray-200'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.enabled ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">音色の選択</span>
                                <div className="grid grid-cols-1 gap-1">
                                    {Object.keys(SOUND_URLS).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => updateSettings({ soundType: type })}
                                            className={`text-xs p-2.5 rounded-xl font-bold text-left transition-all flex items-center justify-between ${settings.soundType === type ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            <span className="capitalize">{type === 'default' ? '標準 (Chime)' : type === 'alert' ? '緊急 (Alert)' : 'スマート (Smart)'}</span>
                                            {settings.soundType === type && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {!isAudioInitialized && (
                                <button 
                                    onClick={initializeAudio}
                                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-blue-200 animate-pulse hover:animate-none transition-all"
                                >
                                    音声を有効にする
                                </button>
                            )}
                        </div>
                    </div>
                )}
                
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-90 ${settings.enabled ? 'bg-white text-blue-600 border-2 border-blue-50' : 'bg-gray-100 text-gray-400'}`}
                >
                    {settings.enabled ? (
                        isAudioInitialized ? <Bell size={20} /> : <AlertTriangle className="text-amber-500" size={20} />
                    ) : (
                        <BellOff size={20} />
                    )}
                </button>
            </div>
        </>
    );
}
