import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { getOutbox, deleteFromOutbox } from '../lib/db';
import { db_fs } from '../lib/firebase';
import { collection, query, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { Trash2, MapPin, List, Map as MapIcon, Plus, Edit, Image as ImageIcon, Bell, BellOff, Video, ChevronRight, Clock, Info } from 'lucide-react';
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
    const [selectedImage, setSelectedImage] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        const saved = localStorage.getItem('notificationSoundEnabled');
        return saved === null ? true : saved === 'true';
    });
    const previousReportIds = useRef(new Set());
    const isFirstLoad = useRef(true);

    const refreshData = async (serverData = []) => {
        try {
            const localData = await getOutbox();
            const mergedMap = new Map();
            serverData.forEach(item => {
                mergedMap.set(item.id, item);
            });
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
        } catch (err) {
            console.error("Refresh failed:", err);
            if (serverData.length > 0) setReports(serverData);
            setStatus('success');
        }
    };

    // Initial Load & Real-time Subscription
    useEffect(() => {
        setStatus('loading');
        let currentServerData = [];
        try {
            const q = query(collection(db_fs, "reports"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                currentServerData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    data: doc.data(),
                    source: 'server'
                }));
                refreshData(currentServerData);
            }, (error) => {
                console.error("Firestore error:", error);
                setStatus('error');
            });
            return () => unsubscribe();
        } catch (err) {
            console.error(err);
            setStatus('error');
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
        } catch (e) {
            console.error(e);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('この報告を削除してもよろしいですか？\n（サーバーからも削除されます）')) return;
        setStatus('loading');
        try {
            const target = reports.find(r => r.id === id);
            
            // 1. Delete from Server if it exists there
            if (target && target.source === 'server') {
                await deleteDoc(doc(db_fs, "reports", String(id)));
            }
            
            // 2. Delete from Local Outbox
            await deleteFromOutbox(id);
            
            // 3. Update UI immediately by removing from state
            setReports(prev => prev.filter(r => r.id !== id));
            setStatus('success');
            
            // 4. Also trigger a full refresh to be sure
            refreshData(reports.filter(r => r.source === 'server' && r.id !== id));
        } catch (e) {
            console.error(e);
            alert('削除失敗: ' + e.message);
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
        <div className="max-w-md mx-auto min-h-screen bg-gray-50 pb-24 relative font-sans">
            {/* Header */}
            <header className="sticky top-0 bg-white/90 backdrop-blur-md z-[100] border-b border-gray-100 p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                            < Bell size={18} className="animate-pulse" />
                        </div>
                        <h1 className="text-xl font-extrabold tracking-tight text-gray-900">リアルタイム災害情報</h1>
                    </div>
                    <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`p-2.5 rounded-xl transition-all ${soundEnabled ? 'bg-blue-50 text-blue-600 shadow-inner' : 'bg-gray-100 text-gray-400 opacity-60'}`}
                    >
                        {soundEnabled ? <Bell size={20} /> : <BellOff size={20} />}
                    </button>
                </div>

                {/* Status Tabs */}
                <div className="flex bg-gray-100/80 p-1 rounded-xl">
                    {[
                        { id: 'list', icon: List, label: 'タイムライン' },
                        { id: 'map', icon: MapIcon, label: '地図表示' },
                        { id: 'live', icon: Video, label: 'LIVE配信' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setViewMode(tab.id)}
                            className={`flex-1 py-2.5 text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${viewMode === tab.id ? 'bg-white text-blue-600 shadow-md transform scale-[1.02]' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <tab.icon size={16} /> {tab.label}
                        </button>
                    ))}
                </div>
                {status === 'loading' && <div className="absolute bottom-0 left-0 h-0.5 bg-blue-600 animate-progress w-full"></div>}
            </header>

            {/* Main Content */}
            <main className="px-4 pt-4">
                {viewMode === 'list' ? (
                    reports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200 mt-4">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <Info size={40} className="text-gray-300" />
                            </div>
                            <p className="font-bold text-lg">現在、報告はありません</p>
                            <p className="text-sm mt-1">新しい情報を入力して共有しましょう</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {reports.map((item) => {
                                const report = item.data;
                                const statusColors = {
                                    '対応中': 'bg-red-500 text-white shadow-red-200',
                                    '応急処置済み２次対応者へ引き継ぎ': 'bg-blue-500 text-white shadow-blue-200',
                                    '現場確認済み 対応不可': 'bg-purple-500 text-white shadow-purple-200',
                                    '現場不明 差戻し': 'bg-green-600 text-white shadow-green-200',
                                    '終了': 'bg-gray-800 text-white shadow-gray-300',
                                };
                                const dateStr = (() => {
                                    try {
                                        let d = report?.reportDate ? new Date(report.reportDate) : (item.created_at ? new Date(item.created_at) : null);
                                        return (d && !isNaN(d.getTime())) ? d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '日時不明';
                                    } catch (e) { return '日時不明'; }
                                })();

                                return (
                                    <div key={item.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-all active:scale-[0.98] active:shadow-none hover:shadow-lg">
                                        {/* Status Header */}
                                        <div className="flex justify-between items-center px-4 pt-4 pb-2">
                                            <span className={`px-4 py-1.5 rounded-full text-xs font-black shadow-lg ${statusColors[report?.status] || 'bg-gray-200 text-gray-700'}`}>
                                                {report?.status}
                                            </span>
                                            <div className="flex items-center text-gray-400 text-xs font-bold gap-1">
                                                <Clock size={12} /> {dateStr}
                                            </div>
                                        </div>

                                        <div className="p-4 flex gap-4">
                                            {/* Photo (Left) */}
                                            <div className="shrink-0">
                                                {report?.photos?.[0] ? (
                                                    <RemoteImage
                                                        src={report.photos[0]}
                                                        alt="現場写真"
                                                        className="w-28 h-28 object-cover rounded-2xl border-2 border-gray-50 shadow-md cursor-zoom-in"
                                                        onClick={() => setSelectedImage(report.photos[0])}
                                                    />
                                                ) : (
                                                    <div className="w-28 h-28 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-gray-300">
                                                        <ImageIcon size={30} className="mb-1" />
                                                        <span className="text-[10px] font-bold">画像なし</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content (Right) */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                <div>
                                                    <div className="text-xs font-black text-blue-600 uppercase tracking-wider mb-0.5">{report?.corp}</div>
                                                    <h2 className="text-lg font-black text-gray-900 leading-tight mb-2 truncate-2-lines">{report?.category}</h2>
                                                    {report?.memo && <p className="text-sm text-gray-600 font-medium line-clamp-2 leading-relaxed">{report.memo}</p>}
                                                </div>

                                                <div className="flex items-center justify-between mt-3">
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleDelete(item.id)} className="w-9 h-9 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors">
                                                            <Trash2 size={16} />
                                                        </button>
                                                        <Link to="/report" state={{ reportData: { ...item.data, id: item.id } }} className="w-9 h-9 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center hover:bg-blue-50 hover:text-blue-500 transition-colors">
                                                            <Edit size={16} />
                                                        </Link>
                                                        {report?.location && (
                                                            <a href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`} target="_blank" rel="noreferrer" className="w-9 h-9 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center hover:bg-green-50 hover:text-green-600 transition-colors">
                                                                <MapPin size={16} />
                                                            </a>
                                                        )}
                                                    </div>
                                                    <ChevronRight size={20} className="text-gray-300" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : viewMode === 'map' ? (
                    <div className="h-[calc(100vh-200px)] w-full rounded-3xl overflow-hidden shadow-2xl border-4 border-white relative z-0">
                        <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                            {reports.map((item) => {
                                const report = item.data;
                                if (!report?.location?.lat || !report?.location?.lng) return null;
                                return (
                                    <Marker key={item.id} position={[Number(report.location.lat), Number(report.location.lng)]} icon={createStatusIcon(report.status)}>
                                        <Popup>
                                            <div className="p-1 min-w-[180px]">
                                                <div className="text-[10px] font-black text-blue-600">{report.corp}</div>
                                                <div className="font-bold text-gray-900 mb-1">{report.category}</div>
                                                {report.photos?.[0] && <RemoteImage src={report.photos[0]} className="w-full h-20 object-cover rounded-lg mb-2 shadow-sm" />}
                                                <div className="text-xs font-bold text-gray-600 mb-2">{report.status}</div>
                                                <Link to="/report" state={{ reportData: { ...item.data, id: item.id } }} className="text-blue-600 text-xs font-bold underline">詳細を確認</Link>
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                    </div>
                ) : <div className="bg-white rounded-3xl p-2 shadow-sm"><LiveView /></div>}
            </main>

            {/* FAB */}
            <Link to="/report" className="fixed bottom-28 right-6 z-[200]">
                <button className="bg-red-600 hover:bg-red-700 text-white rounded-2xl w-16 h-16 flex items-center justify-center shadow-2xl transition-transform active:scale-90 ring-4 ring-white">
                    <Plus size={36} strokeWidth={3} />
                </button>
            </Link>

            {/* Bottom Menu Label */}
            <footer className="fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-100 flex items-center justify-center z-[150]">
                <div className="flex flex-col items-center">
                    <div className="w-10 h-1bg-gray-100 rounded-full mb-3"></div>
                    <div className="flex flex-col items-center text-blue-600 font-black">
                        <List size={26} />
                        <span className="text-xs mt-1 tracking-tighter">タイムラインを表示中</span>
                    </div>
                </div>
            </footer>

            {/* Fullscreen Image Overlay */}
            {selectedImage && (
                <div className="fixed inset-0 z-[3000] bg-black/95 backdrop-blur-xl flex flex-col pt-10 px-4" onClick={() => setSelectedImage(null)}>
                    <div className="flex justify-end p-4">
                        <button className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white text-2xl" onClick={() => setSelectedImage(null)}>✕</button>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-4">
                        <RemoteImage src={selectedImage} alt="Full" className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl shadow-blue-500/20" />
                    </div>
                </div>
            )}
        </div>
    );
}
