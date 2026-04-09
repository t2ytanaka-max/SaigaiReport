import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { db_fs } from '../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

// A minimal placeholder for corp selection just for broadcasting
const corps = [
    '1分団（久原）', '1分団（前船津）', '2分団', '3分団', '4分団（武部）', '4分団（大多武）',
    '5分団', '6分団', '7分団', '8分団', '9分団', '10分団',
    '11分団（皆同）', '11分団（立福寺）', '11分団（梶ノ尾）',
    '12分団（武留路）', '12分団（久津）',
    '13分団（日泊）', '13分団（西部）', '13分団（今村）', '13分団（溝陸）',
    '14分団（二本松）', '14分団（中里）', '14分団（陰平）',
    '15分団（田下）', '15分団（黒木）', 'その他'
];

// 安定したタイマー管理のためのカスタムフック
function useInterval(callback, delay) {
    const savedCallback = useRef();
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);
    useEffect(() => {
        if (delay !== null) {
            let id = setInterval(() => savedCallback.current(), delay);
            return () => clearInterval(id);
        }
    }, [delay]);
}

const SERVER_ID = GAS_URL?.split('/s/')[1]?.substring(0, 8) || 'unknown';

export default function LiveView() {
    const [mode, setMode] = useState('watch'); // 'watch' | 'broadcast'
    const [activeStreams, setActiveStreams] = useState([]);
    const [sendCount, setSendCount] = useState(0);
    const isSendingRef = useRef(false);
    const countRef = useRef(0);
    const [heartbeat, setHeartbeat] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Broadcast state
    const [myCorp, setMyCorp] = useState('');
    const [memo, setMemo] = useState('');
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const intervalRef = useRef(null);
    const latestCorpRef = useRef(myCorp); // 最新の所属名を保持 (アンマウント時のクリーンアップ用)

    // myCorpが変更されたらRefを更新
    useEffect(() => {
        latestCorpRef.current = myCorp;
    }, [myCorp]);

    const [connStatus, setConnStatus] = useState(null); // 'checking' | 'ok' | 'fail'
    const [connError, setConnError] = useState('');
    const [lastSendLog, setLastSendLog] = useState(''); // 配信中の送信状況
    const [lastSendError, setLastSendError] = useState(''); // 送込エラー


    // Fetch live streams (Real-time simplified)
    useEffect(() => {
        if (mode === 'watch') {
            const q = query(collection(db_fs, "live_streams"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const streams = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                // Sort by timestamp if needed, otherwise just set
                setActiveStreams(streams);
            });
            return () => unsubscribe();
        }
    }, [mode]);

    useEffect(() => {
        return () => {
            stopBroadcast();
        };
    }, []);

    // 生存確認用ハートビート（1秒ごとに点滅）
    useEffect(() => {
        const interval = setInterval(() => {
            setHeartbeat(prev => !prev);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // 安定した送信ループ。isBroadcastingがtrueの間、3秒おきにsendFrameを実行。
    useInterval(() => {
        if (isBroadcasting) {
            sendFrame();
        }
    }, isBroadcasting ? 3000 : null);

    const startBroadcast = async () => {
        if (!myCorp) {
            setErrorMsg('所属分団を選択してください。');
            return;
        }

        // LINE browser check
        if (navigator.userAgent.includes('Line')) {
            setErrorMsg('LINE内蔵ブラウザではカメラが制限されるため配信できません。SafariやChromeなど、システムの標準ブラウザで開き直してください。');
            return;
        }

        setErrorMsg('');
        setIsLoading(true);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            streamRef.current = stream;

            // Step 1: Show the UI first so the video element is definitely 'visible'
            setIsBroadcasting(true);
            
            // Step 2: Use a small timeout to let React update the DOM before accessing the ref and playing
            setTimeout(async () => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    try {
                        await videoRef.current.play();
                        console.log("Video playing successfully");
                    } catch (pErr) {
                        console.error("Video play failed:", pErr);
                    }
                }
                setIsLoading(false);

                // 初回の即時送信
                sendFrame();
            }, 100);

        } catch (err) {
            console.error("Camera error:", err);
            setErrorMsg(`カメラの起動に失敗しました: ${err.message}`);
            setIsLoading(false);
            setIsBroadcasting(false);
        }
    };

    const stopBroadcast = () => {
        const targetCorp = latestCorpRef.current;
        console.log("stopBroadcast called for:", targetCorp);

        if (targetCorp) {
            // Firestoreから配信情報を削除 (非同期)
            deleteDoc(doc(db_fs, "live_streams", targetCorp))
                .catch(e => console.error("Live cleanup failed:", e));
        }

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsBroadcasting(false);
    };

    const sendFrame = async () => {
        if (!videoRef.current || !canvasRef.current || !isBroadcasting) return;
        setLastSendError('');

        // 通信用タイムアウトの設定（30秒で強制キャンセル。GASの実行制限に合わせる）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            if (isSendingRef.current) return;
            isSendingRef.current = true;

            const canvas = canvasRef.current;
            const video = videoRef.current;

            // 映像が停止(paused)している場合は自動再生を試みる
            if (video && video.paused) {
                video.play().catch(e => console.warn("Auto-play during sendFrame failed:", e));
            }
            
            // 映像情報の準備が最低限できていない場合はスキップ (2: HAVE_CURRENT_DATA)
            // 一部のブラウザでは準備が整うのが遅いため、条件を緩和しました。
            if (video.readyState < 2) {
                setLastSendLog(`映像準備中 (状態${video.readyState})`);
                return;
            }

            // 解像度の取得と自動リサイズ (超軽量化)
            const MAX_SIZE = 640;
            let vWidth = video.videoWidth || 480;
            let vHeight = video.videoHeight || 640;
            let targetWidth = vWidth;
            let targetHeight = vHeight;

            if (vWidth > vHeight) {
                if (vWidth > MAX_SIZE) {
                    targetHeight = Math.round((vHeight * MAX_SIZE) / vWidth);
                    targetWidth = MAX_SIZE;
                }
            } else {
                if (vHeight > MAX_SIZE) {
                    targetWidth = Math.round((vWidth * MAX_SIZE) / vHeight);
                    targetHeight = MAX_SIZE;
                }
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

            // --- ブラックアウト判定 (輝度チェック) ---
            // カメラの起動直後や省電力機能によ一瞬真っ暗(漆黒)になるのを防ぐ
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            const pixels = imageData.data;
            let brightnessSum = 0;
            const sampleStep = 40; // パフォーマンスのため40画素おきにチェック
            let sampleCount = 0;
            for (let i = 0; i < pixels.length; i += 4 * sampleStep) {
                brightnessSum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                sampleCount++;
            }
            const avgBrightness = brightnessSum / sampleCount;
            if (avgBrightness < 5) { // 255段階中5以下(10よりさらに暗い場合)のみ間引く
                console.warn("Skip sending: Frame too dark (" + avgBrightness.toFixed(1) + ")");
                setLastSendLog(`低照度(黒)のため今回の送信を控えました`);
                return;
            }

            // 画質を 0.3 まで落として通信量を最小化 (0.5 から 0.3 へ)
            const base64Image = canvas.toDataURL('image/jpeg', 0.3);
            let method = video.videoWidth ? `${targetWidth}x${targetHeight}` : "fallback";

            // Firestoreへ送信 (Base64で保存することでStorageコストを削減し、反映速度を最大化)
            await setDoc(doc(db_fs, "live_streams", myCorp), {
                corp: myCorp,
                image: base64Image,
                status: 'LIVE',
                memo: memo,
                timestamp: Date.now() // クライアント時刻で並び替えに使用
            });

            countRef.current += 1;
            setSendCount(countRef.current);
            const logMsg = `送信成功(#${countRef.current}): ${base64Image.length}文字, ${vWidth}x${vHeight}(${method}) (${new Date().toLocaleTimeString()})`;
            setLastSendLog(logMsg);
            console.log(logMsg);
        } catch (e) {
            console.error('Frame send error:', e);
            if (e.name === 'AbortError') {
                setLastSendError('送信タイムアウト (通信が遅いようです)');
            } else {
                setLastSendError(`送信失敗: ${e.message}`);
            }
            setLastSendLog('');
        } finally {
            clearTimeout(timeoutId);
            isSendingRef.current = false;
        }
    };

    return (
        <div className="bg-white min-h-[500px] p-4 rounded-lg">
            {/* Mode Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                <button
                    onClick={() => setMode('watch')}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${mode === 'watch' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}
                >
                    LIVE視聴
                </button>
                <button
                    onClick={() => setMode('broadcast')}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${mode === 'broadcast' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                >
                    自分が配信する
                </button>
            </div>

            {/* Watch Mode */}
            {mode === 'watch' && (
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
                    <div className="flex justify-between items-center border-b pb-2 mb-3">
                        <h2 className="text-sm font-bold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">
                            配信中の現場映像 <span className="text-red-600 ml-2">3秒おきに画像更新</span>
                        </h2>
                    </div>
                    {activeStreams.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                            現在LIVE配信中の現場はありません。
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeStreams.map((stream, idx) => (
                                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden shadow-md flex flex-col bg-white">
                                    <div className="bg-red-50 p-2 flex justify-between items-center border-b border-red-100">
                                        <div className="font-bold text-red-700 flex items-center gap-1 text-sm truncate">
                                            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse flex-shrink-0"></span>
                                            {stream.corp}
                                        </div>
                                        <div className="text-[10px] text-gray-500 whitespace-nowrap">
                                            {new Date(stream.timestamp).toLocaleTimeString('ja-JP')}
                                        </div>
                                    </div>
                                    <div className="bg-black flex items-center justify-center min-h-[240px] max-h-[50vh] overflow-hidden">
                                        <img 
                                            key={stream.timestamp} // Force re-render on new data
                                            src={stream.image} 
                                            alt="Live frame" 
                                            className="max-w-full max-h-[50vh] object-contain" 
                                        />
                                    </div>
                                    <div className="p-2 text-xs bg-gray-50 border-t flex flex-col gap-1">
                                        <div className="text-gray-700 font-medium italic truncate">
                                            {stream.memo || '（メモなし）'}
                                        </div>
                                        <div className="flex justify-between items-center text-[9px] text-gray-400">
                                            <span>{Math.floor((Date.now() - stream.timestamp) / 1000)}秒前</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Broadcast Mode */}
            {mode === 'broadcast' && (
                <div className="space-y-4">
                    {/* 配信説明 */}
                    <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 border border-blue-100 flex justify-between items-start">
                        <div>
                            <p className="font-bold mb-1">【省データ・コマ送りLIVE】</p>
                            <p className="text-xs">3秒おきに画像を送信します。画面を閉じたりスリープさせたりしないでください。</p>
                        </div>
                        {isBroadcasting && (
                            <div className="bg-blue-200 text-blue-900 px-2 py-1 rounded text-[10px] font-bold animate-pulse">
                                配信中
                            </div>
                        )}
                    </div>

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-200">
                            {errorMsg}
                        </div>
                    )}


                    {/* Setup Screen (Hidden when broadcasting) */}
                    <div className={`space-y-4 ${isBroadcasting ? 'hidden' : 'block'}`}>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                                配信者（所属分団） <span className="text-red-600 ml-1">【必須】</span>
                            </label>
                            <select
                                className="w-full h-12 rounded-md border border-gray-300 px-3 bg-white"
                                value={myCorp}
                                onChange={(e) => setMyCorp(e.target.value)}
                            >
                                <option value="">選択してください</option>
                                {corps.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                                現在の状況（メモ） <span className="text-gray-900 ml-1">【任意】</span>
                            </label>
                            <input
                                type="text"
                                className="w-full h-10 rounded-md border border-gray-300 px-3"
                                placeholder="例: 倒木のため車両通行できません"
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                            />
                        </div>
                        <Button
                            className="w-full h-14 bg-red-600 hover:bg-red-700 shadow-md text-lg"
                            onClick={startBroadcast}
                            disabled={isLoading}
                        >
                            {isLoading ? 'カメラ起動中...' : '現場中継を開始する'}
                        </Button>
                    </div>

                    {/* Broadcast Screen (Hidden when not broadcasting) */}
                    <div className={`space-y-3 ${isBroadcasting ? 'block' : 'hidden'}`}>
                        {/* 停止ボタンを映像の上に移動、デザインを赤背景に変更 */}
                        <Button 
                            className="w-full h-14 bg-red-600 hover:bg-red-700 shadow-md text-lg text-white" 
                            onClick={stopBroadcast}
                        >
                            中継を停止する
                        </Button>

                        <div className="relative border-2 border-red-500 rounded-lg overflow-hidden bg-black flex items-center justify-center">
                            <div className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded z-10 animate-pulse flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                                LIVE配信中
                            </div>
                            {lastSendError && (
                                <div className="absolute bottom-2 left-2 bg-red-600/90 text-white text-[10px] px-2 py-1 rounded z-10">
                                    {lastSendError}
                                </div>
                            )}
                            
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-auto max-h-[70vh] object-contain"
                            />
                            <canvas
                                ref={canvasRef}
                                className="hidden"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
