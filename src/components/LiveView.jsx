import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { db_fs } from '../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

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
        if (mode === 'watch') {
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
            setErrorMsg('LINE内蔵ブラウザでは配信できません。標準ブラウザを使用してください。');
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
        if (targetCorp) {
            deleteDoc(doc(db_fs, "live_streams", targetCorp)).catch(e => console.error(e));
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsBroadcasting(false);
    };

    const sendFrame = async () => {
        if (!videoRef.current || !canvasRef.current || !isBroadcasting || isSendingRef.current) return;
        
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
        <div className="bg-white p-4 rounded-lg min-h-[400px]">
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                <button onClick={() => setMode('watch')} className={`flex-1 py-1.5 text-sm font-bold rounded-md ${mode === 'watch' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>LIVE視聴</button>
                <button onClick={() => setMode('broadcast')} className={`flex-1 py-1.5 text-sm font-bold rounded-md ${mode === 'broadcast' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>配信する</button>
            </div>

            {mode === 'watch' ? (
                <div className="space-y-4">
                    {activeStreams.length === 0 ? (
                        <div className="text-center py-20 text-gray-400 text-sm">配信中の現場はありません。</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {activeStreams.map((s, i) => (
                                <div key={i} className="border rounded-lg overflow-hidden bg-black relative">
                                    <div className="absolute top-0 left-0 right-0 bg-black/50 p-2 text-white text-xs font-bold flex justify-between">
                                        <span>{s.corp}</span>
                                        <span className="text-red-400 animate-pulse">● LIVE</span>
                                    </div>
                                    <img src={s.image} alt="Live" className="w-full h-auto max-h-[60vh] object-contain" />
                                    {s.memo && <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-white text-[10px]">{s.memo}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {errorMsg && <div className="bg-red-50 text-red-600 p-3 rounded text-xs">{errorMsg}</div>}
                    
                    {!isBroadcasting ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-bold block mb-1">分団名</label>
                                <select className="w-full h-12 border rounded bg-white px-3" value={myCorp} onChange={e => setMyCorp(e.target.value)}>
                                    <option value="">選択してください</option>
                                    {corps.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <Button className="w-full h-14 bg-red-600" onClick={startBroadcast} disabled={isLoading}>{isLoading ? 'カメラ起動中...' : '配信を開始する'}</Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <Button className="w-full h-14 bg-gray-800" onClick={stopBroadcast}>配信を停止</Button>
                            <div className="relative border-4 border-red-500 rounded-lg overflow-hidden bg-black">
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto" />
                                <canvas ref={canvasRef} className="hidden" />
                                <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-1 rounded text-[10px] animate-pulse">配信中: {sendCount}回送信</div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
