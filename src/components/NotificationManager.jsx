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
    const [isAudioInitialized, setIsAudioInitialized] = useState(() => {
        // UIの状態維持のためにsessionStorageを参照するが、
        // 実際のブラウザ制限解除とは別に管理することを視野に入れる
        return sessionStorage.getItem('saigai_audio_initialized') === 'true';
    });
    
    // 外部（ヘッダーのボタンなど）から設定パネルを開くためのイベントリスナー
    useEffect(() => {
        const handleOpenSettings = () => setShowSettings(prev => !prev);
        const handleGetStatus = () => {
            // 現在の状態を即座に再放送
            window.dispatchEvent(new CustomEvent('saigai:audio-status', { 
                detail: { active: isAudioInitializedRef.current } 
            }));
        };
        
        window.addEventListener('saigai:open-settings', handleOpenSettings);
        window.addEventListener('saigai:request-audio-status', handleGetStatus);
        
        return () => {
            window.removeEventListener('saigai:open-settings', handleOpenSettings);
            window.removeEventListener('saigai:request-audio-status', handleGetStatus);
        };
    }, []);
    
    const myId = getMyDeviceId();
    const startTimeRef = useRef(Date.now());
    const processedIdsRef = useRef(new Set());
    const audioRef = useRef(null);
    
    // 最新の設定状態を常に参照できるように Ref を導入
    const settingsRef = useRef(settings);
    const isAudioInitializedRef = useRef(isAudioInitialized);

    // ステートが更新されたら Ref も更新する
    useEffect(() => { settingsRef.current = settings; }, [settings]);
    useEffect(() => { isAudioInitializedRef.current = isAudioInitialized; }, [isAudioInitialized]);

    // Audio オブジェクトの初期化（一度だけ）
    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }
    }, []);

    // 電子音合成生成 (通信不要)
    const playSynthesizedSound = (type = 'smart') => {
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const volume = settingsRef.current.volume || 0.8;
            
            const playTone = (freq, start, duration) => {
                const osc = context.createOscillator();
                const gain = context.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(volume * 0.3, start);
                gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
                osc.connect(gain);
                gain.connect(context.destination);
                osc.start(start);
                osc.stop(start + duration);
            };

            const now = context.currentTime;
            if (type === 'smart') {
                // ピッ、ピッ、ピッ というスマートな三連音
                playTone(1200, now, 0.1);
                playTone(1200, now + 0.15, 0.1);
                playTone(1200, now + 0.3, 0.1);
            } else {
                // バックアップ用の単音
                playTone(800, now, 0.3);
            }
            
            setTimeout(() => context.close(), 1000);
        } catch (e) {
            console.error("Synthesis failed:", e);
        }
    };

    // 設定変更の保存
    const updateSettings = (newSettings) => {
        const merged = { ...settings, ...newSettings };
        setSettings(merged);
        saveNotificationSettings(merged);
    };

    // 音声再生ロジックの強化（最新の Ref を参照）
    const playNotificationSound = (isTest = false) => {
        const currentSettings = settingsRef.current;
        const currentIsAudioInitialized = isAudioInitializedRef.current;

        if (!isTest && !currentSettings.enabled) return;
        if (!currentIsAudioInitialized) {
            console.warn("Audio not initialized yet. User must click 'Enable Audio'.");
            return;
        }
        
        try {
            // スマートモード、またはファイルがない場合は合成音を使用
            if (currentSettings.soundType === 'smart') {
                playSynthesizedSound('smart');
                return;
            }

            if (audioRef.current) {
                // 再生中の場合は停止
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
                
                audioRef.current.src = SOUND_URLS[currentSettings.soundType] || SOUND_URLS.default;
                audioRef.current.volume = currentSettings.volume || 0.8;
                
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.error("Audio play failed, falling back to synthesis:", e);
                        playSynthesizedSound('fallback');
                        // 重要: ここで false に戻すとベルがまた揺れ始めてしまうため、
                        // ユーザーの明示的なアクション以外で状態を戻さないようにします
                    });
                }
            }
        } catch (e) {
            console.error("Critical error in playNotificationSound:", e);
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
        sessionStorage.setItem('saigai_audio_initialized', 'true');
        setShowSettings(false);
        // テスト再生
        const audio = new Audio(SOUND_URLS[settings.soundType]);
        audio.volume = 0.1;
        audio.play().catch(() => {});
        // 外部（ヘッダー）に音声が有効になったことを通知
        window.dispatchEvent(new CustomEvent('saigai:audio-status', { detail: { active: true } }));
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

            {/* 設定パネル（ヘッダーから呼び出される） */}
            {showSettings && (
                <div className="fixed top-20 right-4 z-[9998] animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-5 w-64 ring-4 ring-black/5">
                        <div className="flex items-center justify-between mb-4">
                            <h5 className="font-black text-sm text-gray-900 tracking-widest uppercase">通知設定</h5>
                            <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-50 rounded-full"><X size={16} className="text-gray-400" /></button>
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
                            <div className="space-y-2 pt-2 border-t border-gray-50">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">音量</span>
                                    <span className="text-[10px] font-bold text-blue-600">{Math.round(settings.volume * 100)}%</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" max="1" step="0.1" 
                                    value={settings.volume} 
                                    onChange={(e) => updateSettings({ volume: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>
                            
                            {!isAudioInitialized ? (
                                <button 
                                    onClick={initializeAudio}
                                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-blue-200 animate-pulse hover:animate-none transition-all flex items-center justify-center gap-2"
                                >
                                    <Volume2 size={16} />
                                    音声を有効にする
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <button 
                                        onClick={() => playNotificationSound(true)}
                                        className="w-full bg-gray-50 text-gray-700 py-3 rounded-xl font-black text-xs border border-gray-100 hover:bg-white hover:border-blue-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Radio size={14} className="text-blue-500" />
                                        テスト再生
                                    </button>
                                    <div className="pt-1 border-t border-gray-50">
                                        <p className="text-[10px] text-green-600 font-bold text-center flex items-center justify-center gap-1">
                                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                                            音声は有効です
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
