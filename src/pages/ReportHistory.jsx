import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { getOutbox, deleteFromOutbox } from '../lib/db';
import { db_fs } from '../lib/firebase';
import { collection, query, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { Trash2, MapPin, List, Map as MapIcon, Plus, Edit, Image as ImageIcon, Bell, BellOff, Video } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import LiveView from '../components/LiveView';
import { GAS_URL } from '../config';

// Fix for default marker icon in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Reliable Image Component
const RemoteImage = ({ src, alt, className, onClick, ...props }) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [loading, setLoading] = useState(true);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
            setImgSrc(src);
            setLoading(false);
            return;
        }
        setImgSrc(src);
        setLoading(true);
    }, [src]);

    const handleError = () => {
        if (retryCount === 0 && src && typeof src === 'string' && src.startsWith('http')) {
            setRetryCount(1);
            setLoading(true);
            let id = null;
            const match1 = src.match(/id=([a-zA-Z0-9_-]+)/);
            const match2 = src.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match1) id = match1[1];
            else if (match2) id = match2[1];

            if (id && GAS_URL) {
                fetch(`${GAS_URL}?action=getImage&id=${id}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'success' && data.image) {
                            setImgSrc(data.image);
                        } else {
                            setImgSrc(null);
                        }
                    })
                    .catch(() => setImgSrc(null))
                    .finally(() => setLoading(false));
            } else {
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    };

    if (!imgSrc && !loading) {
        return (
            <div className={`bg-gray-100 flex items-center justify-center text-gray-300 ${className}`} {...props}>
                <ImageIcon size={24} />
            </div>
        );
    }

    return (
        <img
            src={imgSrc || ''}
            alt={alt || ''}
            className={className || ''}
            onError={handleError}
            onClick={onClick}
            {...props}
        />
    );
};

export default function ReportHistory() {
    const [reports, setReports] = useState([]);
    const [status, setStatus] = useState('loading');
    const [viewMode, setViewMode] = useState('list');
    const [debugInfo, setDebugInfo] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        const saved = localStorage.getItem('notificationSoundEnabled');
        return saved === null ? true : saved === 'true';
    });
    const previousReportIds = useRef(new Set());
    const isFirstLoad = useRef(true);

    // Initial Load & Real-time Subscription
    useEffect(() => {
        setStatus('loading');
        console.log("Starting Firestore subscription...");

        try {
            const q = query(collection(db_fs, "reports"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const serverData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    data: doc.data(),
                    source: 'server'
                }));

                getOutbox().then(localData => {
                    const mergedMap = new Map();
                    // Add server items
                    serverData.forEach(item => {
                        mergedMap.set(item.id, item);
                    });
                    // Add local items
                    localData.forEach(item => {
                        mergedMap.set(item.id, { ...item, source: 'local' });
                    });

                    const mergedList = Array.from(mergedMap.values());
                    const sorted = mergedList.sort((a, b) => {
                        const dateA = a?.data?.reportDate ? new Date(a.data.reportDate).getTime() : 0;
                        const dateB = b?.data?.reportDate ? new Date(b.data.reportDate).getTime() : 0;
                        return dateB - dateA;
                    });

                    detectChangesAndNotify(sorted);
                    setReports(sorted);
                    setStatus('success');
                }).catch(err => {
                    console.error("Local DB fetch failed:", err);
                    setReports(serverData);
                    setStatus('success');
                });
            }, (error) => {
                console.error("Firestore Subscribe error:", error);
                setStatus('error');
                setDebugInfo(error.message);
            });

            return () => unsubscribe();
        } catch (err) {
            console.error("Effect Crash:", err);
            setStatus('error');
            setDebugInfo(err.message);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('notificationSoundEnabled', soundEnabled.toString());
    }, [soundEnabled]);

    const detectChangesAndNotify = (newReports) => {
        if (isFirstLoad.current) {
            isFirstLoad.current = false;
            previousReportIds.current = new Set(newReports.map(r => r.id));
            return;
        }
        const currentIds = new Set(newReports.map(r => r.id));
        const hasNewReports = newReports.some(r => !previousReportIds.current.has(r.id));
        if (hasNewReports && soundEnabled) {
            playNotificationSound();
        }
        previousReportIds.current = currentIds;
    };

    const playNotificationSound = () => {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.3;
            oscillator.start(audioContext.currentTime);
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.2);
            oscillator.stop(audioContext.currentTime + 0.4);
            setTimeout(() => audioContext.close(), 500);
        } catch (error) {
            console.error('Failed to play notification sound:', error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('この報告を削除してもよろしいですか？\n（サーバーからも削除されます）')) return;
        setStatus('loading');
        try {
            const cleanId = String(id).trim();
            const target = reports.find(r => r.id === id);
            const shouldDelete = target && (target.source === 'server' || target.status === 'synced');
            if (shouldDelete) {
                await deleteDoc(doc(db_fs, "reports", cleanId));
            }
            await deleteFromOutbox(id);
            setStatus('success');
        } catch (e) {
            console.error(e);
            alert('削除エラー: ' + e.message);
            setStatus('error');
        }
    };

    const mapCenter = useMemo(() => {
        const points = reports.filter(r => r.data?.location?.lat);
        if (points.length === 0) return [35.681236, 139.767125];
        const sumLat = points.reduce((sum, r) => sum + Number(r.data.location.lat), 0);
        const sumLng = points.reduce((sum, r) => sum + Number(r.data.location.lng), 0);
        return [sumLat / points.length, sumLng / points.length];
    }, [reports]);

    const createStatusIcon = (status) => {
        let color = '#4b5563';
        switch (status) {
            case '対応中': color = '#dc2626'; break;
            case '応急処置済み２次対応者へ引き継ぎ': color = '#2563eb'; break;
            case '現場確認済み 対応不可': color = '#9333ea'; break;
            case '現場不明 差戻し': color = '#16a34a'; break;
            case '終了': color = '#000000'; break;
        }
        const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="30" height="30" stroke="white" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>`;
        return L.divIcon({ className: 'custom-icon', html: svgIcon, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30] });
    };

    return (
        <div className="max-w-md mx-auto min-h-screen bg-white pb-20 relative">
            <header className="sticky top-0 bg-white z-10 border-b border-gray-100 p-3 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-gray-800">全災害情報タイムライン</h1>
                        {status === 'loading' && <span className="text-sm font-bold text-red-600 animate-pulse">更新中...</span>}
                        {status === 'error' && <span className="text-sm font-bold text-red-600">通信エラー</span>}
                    </div>
                    <button onClick={() => setSoundEnabled(!soundEnabled)} className={`p-2 rounded-full transition-colors ${soundEnabled ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                        {soundEnabled ? <Bell size={20} /> : <BellOff size={20} />}
                    </button>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setViewMode('list')} className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center gap-1 transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}><List size={16} /> 一覧</button>
                    <button onClick={() => setViewMode('map')} className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center gap-1 transition-all ${viewMode === 'map' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}><MapIcon size={16} /> 地図</button>
                    <button onClick={() => setViewMode('live')} className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center gap-1 transition-all ${viewMode === 'live' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}><Video size={16} /> LIVE</button>
                </div>
                {debugInfo && <div className="text-[10px] text-red-500 mt-1 break-all">{debugInfo}</div>}
            </header>

            <main>
                {viewMode === 'list' ? (
                    reports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <List size={48} className="mb-2 opacity-20" />
                            <p>報告履歴はありません</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {reports.map((item) => {
                                const report = item.data;
                                const hasPhoto = report?.photos && report.photos.length > 0;
                                const dateStr = (() => {
                                    try {
                                        let d = report?.reportDate ? new Date(report.reportDate) : (item.created_at ? new Date(item.created_at) : null);
                                        return (d && !isNaN(d.getTime())) ? d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '日時不明';
                                    } catch (e) { return '日時不明'; }
                                })();
                                return (
                                    <div key={item.id} className="p-3 flex gap-3 hover:bg-gray-50">
                                        <div className="shrink-0">
                                            {hasPhoto ? <RemoteImage src={report.photos[0]} alt="thumb" className="w-20 h-20 object-cover rounded-md border" onClick={() => setSelectedImage(report.photos[0])} /> : <div className="w-20 h-20 bg-gray-100 rounded-md border flex items-center justify-center text-gray-300"><ImageIcon size={24} /></div>}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div>
                                                <div className="font-bold text-sm text-gray-800 mb-1">{report?.corp} {report?.category} <span className={report?.status === '対応中' ? 'text-red-600' : 'text-gray-600'}>{report?.status}</span></div>
                                                <div className="text-xs text-gray-500">{dateStr}</div>
                                                {report?.memo && <div className="text-sm text-gray-700 mt-1 line-clamp-2">{report.memo}</div>}
                                            </div>
                                            <div className="flex justify-end gap-3 mt-1">
                                                <button onClick={() => handleDelete(item.id)} className="text-gray-400"><Trash2 size={16} /></button>
                                                <Link to="/report" state={{ reportData: { ...item.data, id: item.id } }} className="text-gray-400"><Edit size={16} /></Link>
                                                {report?.location && <a href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`} target="_blank" rel="noreferrer" className="text-gray-400"><MapPin size={16} /></a>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : viewMode === 'map' ? (
                    <div className="h-[calc(100vh-140px)] w-full">
                        <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                            {reports.map((item) => {
                                const report = item.data;
                                if (!report?.location?.lat || !report?.location?.lng) return null;
                                return (
                                    <Marker key={item.id} position={[Number(report.location.lat), Number(report.location.lng)]} icon={createStatusIcon(report.status)}>
                                        <Popup>
                                            <div className="text-sm">
                                                <div className="font-bold">{report.corp} {report.category}</div>
                                                <div className="text-xs text-gray-500 mb-2">{report.status}</div>
                                                {report.photos?.[0] && <RemoteImage src={report.photos[0]} className="w-full h-24 object-cover rounded mb-2" />}
                                                <div className="line-clamp-2 mb-1">{report.memo || report.detail}</div>
                                                <Link to="/report" state={{ reportData: { ...item.data, id: item.id } }} className="text-blue-600 text-xs">詳細・編集</Link>
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                    </div>
                ) : <LiveView />}
            </main>

            <Link to="/report" className="fixed bottom-6 right-6 z-50">
                <button className="bg-blue-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-xl"><Plus size={32} /></button>
            </Link>

            <footer className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t flex items-center justify-center text-blue-600 text-[10px] font-bold">
                <div className="flex flex-col items-center"><List size={24} /><span>災害報告</span></div>
            </footer>

            {selectedImage && (
                <div className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
                    <div className="relative max-w-full max-h-full">
                        <RemoteImage src={selectedImage} alt="Full" className="max-w-full max-h-[90vh] object-contain" />
                        <button className="absolute top-0 right-0 p-4 text-white" onClick={() => setSelectedImage(null)}>✕</button>
                    </div>
                </div>
            )}
        </div>
    );
}
