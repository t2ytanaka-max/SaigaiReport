import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { db_fs } from '../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Video, Camera, StopCircle, Eye, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

const corps = [
    '1分団（久原）', '1分団（前船津）', '2分団', '3分団', '4分団（武部）', '4分団（大多武）',
    '5分団', '6分団', '7分団', '8分団', '9分団', '10分団',
    '11分団（皆同）', '11分団（立福寺）', '11分団（梶ノ尾）',
    '12分団（武留路）', '12分団（久津）',
    '13分団（日泊）', '13分団（西部）', '13分団（今村）', '13分団（溝陸）',
    '14分団（二本松）', '14分団（中里）', '14分団（陰平）',
    '15分団（田下）', '15分団（黒木）', 'その他'
];

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

export default function LiveView() {
    const [mode, setMode] = useState('watch');
    const [activeStreams, setActiveStreams] = useState([]);
    const [sendCount, setSendCount] = useState(0);
    const isSendingRef = useRef(false);
    const countRef = useRef(0);
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [myCorp, setMyCorp] = useState('');
    const [memo, setMemo] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const latestCorpRef = useRef(myCorp);

    useEffect(() => {
        latestCorpRef.current = myCorp;
    }, [myCorp]);

    // Watching mode stream listener
    useEffect(() => {
        if (mode === 'watch' && db_fs) {
            const q = query(collection(db_fs, "live_streams"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const streams = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setActiveStreams(streams);
            }, (err) => {
                console.error("Live streams listen error:", err);
            });
            return () => unsubscribe();
        }
    }, [mode]);

    useEffect(() => {
        return () => stopBroadcast();
    }, []);

    useInterval(() => {
        if (isBroadcasting) sendFrame();
    }, isBroadcasting ? 3000 : null);

    const startBroadcast = async () => {
        if (!myCorp) {
            setErrorMsg('所属分団を選択してください。');
            return;
        }
        if (navigator.userAgent.includes('Line')) {
            setErrorMsg('LINE内蔵ブラウザでは配信できません。システムの標準ブラウザ（Chrome/Safari等）を使用してください。');
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
            setIsBroadcasting(true);
            
            setTimeout(async () => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    try { await videoRef.current.play(); } catch (e) { console.error(e); }
                }
                setIsLoading(false);
                sendFrame();
            }, 100);
        } catch (err) {
            setErrorMsg(`カメラ起動失敗: ${err.message}`);
            setIsLoading(false);
            setIsBroadcasting(false);
        }
    };

    const stopBroadcast = () => {
        const targetCorp = latestCorpRef.current;
        if (targetCorp && db_fs) {
            deleteDoc(doc(db_fs, "live_streams", targetCorp)).catch(e => console.error(e));
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsBroadcasting(false);
    };

    const sendFrame = async () => {
        if (!videoRef.current || !canvasRef.current || !isBroadcasting || isSendingRef.current || !db_fs) return;
        
        try {
            isSendingRef.current = true;
            const canvas = canvasRef.current;
            const video = videoRef.current;
            if (video.readyState < 2) return;

            const MAX_SIZE = 640;
            let targetWidth = video.videoWidth;
            let targetHeight = video.videoHeight;
            if (targetWidth > MAX_SIZE) {
                targetHeight = Math.round((targetHeight * MAX_SIZE) / targetWidth);
                targetWidth = MAX_SIZE;
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

            const base64Image = canvas.toDataURL('image/jpeg', 0.3);

            await setDoc(doc(db_fs, "live_streams", myCorp), {
                corp: myCorp,
                image: base64Image,
                status: 'LIVE',
                memo: memo,
                timestamp: Date.now()
            });

            countRef.current += 1;
            setSendCount(countRef.current);
        } catch (e) {
            console.error('Frame send error:', e);
        } finally {
            isSendingRef.current = false;
        }
    };

    return (
        <div className="bg-gray-50 p-2 sm:p-4 rounded-3xl min-h-[400px]">
            {/* View Switcher */}
            <div className="flex bg-gray-200/50 p-1.5 rounded-2xl mb-6 shadow-inner">
                <button 
                    onClick={() => { setMode('watch'); stopBroadcast(); }} 
                    className={`flex-1 py-3 text-sm font-black rounded-xl flex items-center justify-center gap-2 transition-all ${mode === 'watch' ? 'bg-white text-red-600 shadow-md transform scale-[1.02]' : 'text-gray-500'}`}
                >
                    <Eye size={18} /> 現場を視聴する
                </button>
                <button 
                    onClick={() => setMode('broadcast')} 
                    className={`flex-1 py-3 text-sm font-black rounded-xl flex items-center justify-center gap-2 transition-all ${mode === 'broadcast' ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500'}`}
                >
                    <Video size={18} /> 現場を配信する
                </button>
            </div>

            {mode === 'watch' ? (
                <div className="space-y-6">
                    {activeStreams.length === 0 ? (
                        <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm flex flex-col items-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <Video size={32} className="text-gray-300" />
                            </div>
                            <p className="text-gray-500 font-bold">配信中の現場はありません</p>
                            <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">No active live streams</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6">
                            {activeStreams.map((s, i) => (
                                <div key={i} className="group relative bg-black rounded-3xl overflow-hidden shadow-xl border-2 border-white aspect-video sm:aspect-auto">
                                    {/* Overlay Header */}
                                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 z-10 flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <span className="text-white font-black text-sm drop-shadow-md">{s.corp}</span>
                                            <span className="text-gray-300 text-[10px] font-bold">LIVE STREAMING...</span>
                                        </div>
                                        <div className="flex items-center bg-red-600 text-white px-3 py-1 rounded-full text-[10px] font-black animate-pulse shadow-lg ring-2 ring-white/50">
                                            ● LIVE
                                        </div>
                                    </div>
                                    
                                    <img src={s.image} alt="Live" className="w-full h-full object-cover sm:h-[400px]" />
                                    
                                    {/* Overlay Bottom */}
                                    {s.memo && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                                            <div className="flex items-center gap-2 text-white/90">
                                                <AlertCircle size={14} className="shrink-0" />
                                                <p className="text-xs font-bold leading-tight">{s.memo}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-6 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    {errorMsg && (
                        <div className="bg-red-50 border-2 border-red-100 text-red-600 p-4 rounded-2xl text-sm font-bold flex items-center gap-3 animate-in slide-in-from-top-4 duration-300">
                            <AlertCircle size={20} className="shrink-0" />
                            {errorMsg}
                        </div>
                    )}
                    
                    {!isBroadcasting ? (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-black text-gray-900 uppercase tracking-widest block ml-1">配信者情報</label>
                                <div className="space-y-4">
                                    <select 
                                        className="w-full h-14 border-2 border-gray-200 rounded-2xl bg-gray-50 px-4 text-gray-900 font-bold focus:border-blue-500 focus:bg-white transition-all outline-none text-base shadow-sm"
                                        value={myCorp} 
                                        onChange={e => setMyCorp(e.target.value)}
                                    >
                                        <option value="">所属分団を選択</option>
                                        {corps.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <textarea 
                                        placeholder="活動メモ (例: 車両通行できません)" 
                                        className="w-full min-h-[100px] border-2 border-gray-200 rounded-2xl bg-gray-50 px-4 py-3 text-gray-900 font-bold focus:border-blue-500 focus:bg-white transition-all outline-none text-base shadow-sm"
                                        value={memo}
                                        onChange={e => setMemo(e.target.value)}
                                    />
                                </div>
                            </div>
                            
                            <Button 
                                className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 border-none appearance-none" 
                                onClick={startBroadcast} 
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <><RefreshCw size={24} className="animate-spin" /> カメラ起動中...</>
                                ) : (
                                    <><Camera size={24} /> リアルタイム配信を開始</>
                                )}
                            </Button>
                            
                            <p className="text-xs text-gray-800 text-center font-black px-4 leading-relaxed bg-yellow-50 py-3 rounded-xl border border-yellow-100 shadow-inner">
                                ※3秒おきに最新画像を送信します。通信環境をご確認ください。<br/>配信中はカメラを閉じないでください。
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Button 
                                className="w-full h-16 bg-gray-900 text-white rounded-2xl font-black text-lg shadow-xl border-4 border-white active:scale-[0.98] transition-all flex items-center justify-center gap-3" 
                                onClick={stopBroadcast}
                            >
                                <StopCircle size={24} /> 配信を停止する
                            </Button>
                            
                            <div className="relative border-4 border-red-500 rounded-3xl overflow-hidden bg-black shadow-2xl ring-8 ring-red-500/10">
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto aspect-video object-cover" />
                                <canvas ref={canvasRef} className="hidden" />
                                
                                <div className="absolute top-4 left-4 flex flex-col gap-2">
                                    <div className="bg-red-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black animate-pulse flex items-center gap-1.5 shadow-lg border border-white/50">
                                        <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                                        ライブ配信中
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-blue-50 border-2 border-blue-100 p-4 rounded-2xl text-[11px] text-blue-700 font-bold">
                                配信内容: {myCorp} {memo ? ` - ${memo}` : ''}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
