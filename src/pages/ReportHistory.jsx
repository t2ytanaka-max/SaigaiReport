import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { getOutbox, deleteFromOutbox } from '../lib/db';
import { db_fs } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
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

    // GAS URL Proxy
    

    useEffect(() => {
        // If it's already a data URI or blob, correct immediately
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
            setImgSrc(src);
            setLoading(false);
            return;
        }

        // Initially try the original URL
        setImgSrc(src);
        setLoading(true);
    }, [src]);

    const handleError = () => {
        if (retryCount === 0 && src.startsWith('http')) {
            console.log("Image load failed, trying GAS proxy...", src);
            setRetryCount(1);
            setLoading(true);

            // Attempt to extract File ID
            let id = null;
            const match1 = src.match(/id=([a-zA-Z0-9_-]+)/);
            const match2 = src.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match1) id = match1[1];
            else if (match2) id = match2[1];

            if (id) {
                fetch(`${GAS_URL}?action=getImage&id=${id}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'success' && data.image) {
                            setImgSrc(data.image);
                        } else {
                            console.error("Proxy fetch failed:", data);
                            setImgSrc(null); // Give up
                        }
                    })
                    .catch(e => {
                        console.error("Proxy error:", e);
                        setImgSrc(null);
                    })
                    .finally(() => setLoading(false));
            } else {
                setLoading(false);
            }
        } else {
            // Already retried or un-parseable ID
            setLoading(false);
        }
    };

    if (!imgSrc && !loading) {
        // Fallback placeholder
        return (
            <div className={`bg-gray-100 flex items-center justify-center text-gray-300 ${className}`} {...props}>
                <ImageIcon size={24} />
            </div>
        );
    }

    return (
        <img
            src={imgSrc}
            alt={alt}
            className={className}
            onError={handleError}
            onClick={onClick}
            {...props}
        />
    );
};

export default function ReportHistory() {
    // ... existing state ...
    const [reports, setReports] = useState([]);
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
    const [debugInfo, setDebugInfo] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        const saved = localStorage.getItem('notificationSoundEnabled');
        return saved === null ? true : saved === 'true';
    });
    const previousReportIds = useRef(new Set());
    const isFirstLoad = useRef(true);

    

    // ... loadReports ...

    // 1. Initial Load & Real-time Subscription
    useEffect(() => {
        setStatus('loading');

        // Create query for FireStore
        // Create query for FireStore (Initially simple to avoid index errors)
        const q = query(collection(db_fs, "reports"));

        // Subscribe to real-time updates
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const serverData = snapshot.docs.map(doc => ({
                id: doc.id,
                data: doc.data(),
                source: 'server'
            }));

            // Async inside sync snapshot must be handled carefully
            getOutbox().then(localData => {
                // Merge logic (Local Priority)
                const mergedMap = new Map();

                // Add server items
                serverData.forEach(item => {
                    mergedMap.set(item.id, item);
                });

                // Always overwrite with local data (Optimistic UI) 
                localData.forEach(item => {
                    mergedMap.set(item.id, { ...item, source: 'local' });
                });

                const mergedList = Array.from(mergedMap.values());
                const sorted = mergedList.sort((a, b) => {
                    const dateA = a?.data?.reportDate ? new Date(a.data.reportDate).getTime() : 0;
                    const dateB = b?.data?.reportDate ? new Date(b.data.reportDate).getTime() : 0;
                    return dateB - dateA;
                });

                // Detect changes and play sound
                detectChangesAndNotify(sorted);
                
                setReports(sorted);
                setStatus('success');
            }).catch(dbErr => {
                console.error("Local DB read error:", dbErr);
                // Fallback to server data only
                setReports(serverData);
                setStatus('success');
            });

        }, (error) => {
            console.error("Firestore Subscribe error:", error);
            setStatus('error');
            // Show error info in debug for a moment if white screen problem persists
            setDebugInfo(error.message);
        });

        return () => unsubscribe();
    }, []);

    // Persist sound setting
    useEffect(() => {
        localStorage.setItem('notificationSoundEnabled', soundEnabled.toString());
    }, [soundEnabled]);

    // Detect new or updated reports
    const detectChangesAndNotify = (newReports) => {
        if (isFirstLoad.current) {
            // On first load, just record IDs
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

    // Play notification sound using Web Audio API
    const playNotificationSound = () => {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Two-tone notification
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.3;

            oscillator.start(audioContext.currentTime);
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.2);
            oscillator.stop(audioContext.currentTime + 0.4);

            // Cleanup
            setTimeout(() => audioContext.close(), 500);
        } catch (error) {
            console.error('Failed to play notification sound:', error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('この報告を削除してもよろしいですか？\n（サーバーからも削除されます）')) {
            return;
        }

        setStatus('loading');

        try {
            // Find the report to see if we need to delete from server
            const cleanId = String(id).trim();
            const target = reports.find(r => r.id === id);

            // Should delete from server if it came from server or is marked synced
            const shouldDeleteFromServer = target && (target.source === 'server' || target.status === 'synced');

            if (shouldDeleteFromServer) {
                // Call Firestore delete
                await deleteDoc(doc(db_fs, "reports", cleanId));
            }

            // Always try to delete from local outbox just in case
            await deleteFromOutbox(id);

            // Refresh list (Firestore's onSnapshot handles this automatically, so no manual fetch needed)
            setStatus('success');

        } catch (e) {
            console.error(e);
            alert('通信エラーまたは削除エラーが発生しました: ' + e.message);
            setStatus('error');
        }
    };

    // Calculate center for map
    const mapCenter = useMemo(() => {
        const points = reports.filter(r => r.data.location?.lat);
        if (points.length === 0) return [35.681236, 139.767125]; // Tokyo Station default

        const sumLat = points.reduce((sum, r) => sum + Number(r.data.location.lat), 0);
        const sumLng = points.reduce((sum, r) => sum + Number(r.data.location.lng), 0);
        return [sumLat / points.length, sumLng / points.length];
    }, [reports]);

    // カスタムアイコンを作成する関数
    const createStatusIcon = (status) => {
        let color = '#4b5563'; // デフォルト: グレー

        switch (status) {
            case '対応中':
                color = '#dc2626'; // 赤
                break;
            case '応急処置済み２次対応者へ引き継ぎ':
                color = '#2563eb'; // 青
                break;
            case '現場確認済み 対応不可':
                color = '#9333ea'; // 紫
                break;
            case '現場不明 差戻し':
                color = '#16a34a'; // 緑
                break;
            case '終了':
                color = '#000000'; // 黒
                break;
        }

        const svgIcon = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="30" height="30" stroke="white" stroke-width="1.5">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5" fill="white"/>
            </svg>
        `;

        return L.divIcon({
            className: 'custom-icon',
            html: svgIcon,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -30]
        });
    };

    return (
        <div className="max-w-md mx-auto min-h-screen bg-white pb-20 relative">
            {/* Header */}
            <header className="sticky top-0 bg-white z-10 border-b border-gray-100 p-3 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-gray-800">全災害情報タイムライン</h1>
                        {status === 'loading' && <span className="text-sm font-bold text-red-600 animate-pulse">更新中...</span>}
                        {status === 'error' && <span className="text-sm font-bold text-red-600">通信エラー</span>}
                    </div>
                    <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`p-2 rounded-full transition-colors ${soundEnabled ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-100'
                            }`}
                        title={soundEnabled ? '通知音: ON' : '通知音: OFF'}
                    >
                        {soundEnabled ? <Bell size={20} /> : <BellOff size={20} />}
                    </button>
                </div>

                {/* View Toggle Tabs */}
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center gap-1 transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        <List size={16} /> 一覧
                    </button>
                    <button
                        onClick={() => setViewMode('map')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center gap-1 transition-all ${viewMode === 'map' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        <MapIcon size={16} /> 地図
                    </button>
                    <button
                        onClick={() => setViewMode('live')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center gap-1 transition-all ${viewMode === 'live' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        <Video size={16} /> LIVE
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="bg-white">
                {viewMode === 'list' ? (
                    /* LIST VIEW - New Layout */
                    reports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <List size={48} className="mb-2 opacity-20" />
                            <p>報告履歴はありません</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {reports.map((item) => {
                                const report = item.data;
                                const hasPhoto = report.photos && report.photos.length > 0;
                                const dateStr = (() => {
                                    try {
                                        let d = report.reportDate ? new Date(report.reportDate) : null;
                                        if (!d || isNaN(d.getTime()) || d.getTime() === 0) {
                                            d = item.created_at ? new Date(item.created_at) : null;
                                        }
                                        if (!d || isNaN(d.getTime()) || d.getTime() === 0) return '日時不明';
                                        return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                    } catch (e) { return ''; }
                                })();

                                return (
                                    <div key={item.id} className="p-3 flex gap-3 transition-colors hover:bg-gray-50">
                                        {/* Thumbnail (Left) */}
                                        <div className="shrink-0">
                                            {hasPhoto ? (
                                                <RemoteImage
                                                    src={report.photos[0]}
                                                    alt="thumb"
                                                    className="w-20 h-20 object-cover rounded-md border border-gray-200 cursor-zoom-in"
                                                    onClick={() => setSelectedImage(report.photos[0])}
                                                />
                                            ) : (
                                                <div className="w-20 h-20 bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center text-gray-300">
                                                    <ImageIcon size={24} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Content (Right) */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div>
                                                {/* Line 1: Corp Category Status */}
                                                <div className="font-bold text-sm text-gray-800 leading-snug mb-1">
                                                    {report.corp} {report.category} <span
                                                        className={
                                                            report.status === '対応中' ? 'text-red-600' :
                                                                report.status === '応急処置済み２次対応者へ引き継ぎ' ? 'text-blue-600' :
                                                                    report.status === '現場確認済み 対応不可' ? 'text-purple-600' :
                                                                        report.status === '現場不明 差戻し' ? 'text-green-600' :
                                                                            report.status === '終了' ? 'text-black' : 'text-gray-800'
                                                        }
                                                    >
                                                        {report.status}
                                                    </span>
                                                </div>
                                                {/* Line 2: Date */}
                                                <div className="text-sm font-bold text-gray-700 mt-1">
                                                    {dateStr}
                                                </div>
                                                {report.memo && (
                                                    <div className="text-sm text-black font-medium mt-1 whitespace-pre-wrap">
                                                        {report.memo}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Icons (Bottom Right) */}
                                            <div className="flex justify-end items-center gap-4 mt-1">
                                                {/* Delete */}
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-gray-500 hover:text-red-500 p-1"
                                                >
                                                    <Trash2 size={18} />
                                                </button>

                                                {/* Edit */}
                                                <Link
                                                    to="/report"
                                                    state={{ reportData: { ...report, id: item.id } }}
                                                    className="text-gray-500 hover:text-blue-500 p-1"
                                                >
                                                    <Edit size={18} />
                                                </Link>

                                                {/* Map */}
                                                {report.location && (
                                                    <a
                                                        href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-gray-500 hover:text-green-600 p-1"
                                                    >
                                                        <MapPin size={18} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : viewMode === 'map' ? (
                    /* MAP VIEW */
                    <div className="h-[calc(100vh-140px)] w-full relative z-0">
                        <MapContainer
                            center={mapCenter}
                            zoom={13}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            />
                            {reports.map((item) => {
                                const report = item.data;
                                if (!report.location?.lat || !report.location?.lng) return null;

                                return (
                                    <Marker
                                        key={`${item.id}-${report.status}`}
                                        position={[Number(report.location.lat), Number(report.location.lng)]}
                                        icon={createStatusIcon(report.status)}
                                    >
                                        <Popup>
                                            <div className="p-2 min-w-[200px]">
                                                <div className="font-bold border-b border-gray-100 pb-1 mb-1 text-xs text-gray-600">{report.corp}</div>
                                                <div className="font-bold text-sm mb-1">{report.category}</div>
                                                <div className="text-xs text-gray-500 mb-2">
                                                    {new Date(report.reportDate || item.created_at).toLocaleString('ja-JP')}
                                                </div>
                                                <div className={`text-sm font-semibold mb-2 ${report.status === '対応中' ? 'text-red-600' :
                                                    report.status === '応急処置済み２次対応者へ引き継ぎ' ? 'text-blue-600' :
                                                        report.status === '現場確認済み 対応不可' ? 'text-purple-600' :
                                                            report.status === '現場不明 差戻し' ? 'text-green-600' :
                                                                report.status === '終了' ? 'text-black' : 'text-gray-600'
                                                    }`}>
                                                    {report.status}
                                                </div>
                                                {report.photos && report.photos.length > 0 && (
                                                    <div className="w-full h-32 mb-2">
                                                        <RemoteImage
                                                            src={report.photos[0]}
                                                            alt="現場写真"
                                                            className="w-full h-full object-cover rounded"
                                                        />
                                                    </div>
                                                )}
                                                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                                                    {report.detail}
                                                </div>
                                                {/* Memo Display in Popup */}
                                                {report.memo && (
                                                    <div className="mt-2 pt-2 border-t border-gray-100 text-sm font-medium text-black bg-yellow-50 p-1 rounded">
                                                        📝 {report.memo}
                                                    </div>
                                                )}
                                                <div className="text-right mt-2">
                                                    <Link
                                                        to="/report"
                                                        state={{ reportData: { ...report, id: item.id } }}
                                                        className="text-blue-600 underline text-xs"
                                                    >
                                                        詳細・編集
                                                    </Link>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/90 px-4 py-1 rounded-full text-xs shadow-lg z-[1000] pointer-events-none border border-gray-200 font-bold text-gray-600">
                            {reports.filter(r => r.data.location?.lat).length}件 表示中
                        </div>
                    </div>
                ) : (
                    /* LIVE VIEW */
                    <LiveView />
                )}
            </div >

            {/* Floating Action Button (FAB) for New Report */}
            < Link to="/report" className="fixed bottom-6 right-6 z-50" >
                <button
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-xl transition-transform active:scale-95"
                    aria-label="新規報告"
                >
                    <Plus size={32} />
                </button>
            </Link >

            {/* Simple Bottom Navigation Bar Decoration (Optional matching user image style) */}
            < div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-center text-blue-600 text-xs" >
                <div className="flex flex-col items-center">
                    <List size={24} />
                    <span className="font-bold mt-1">災害報告</span>
                </div>
            </div >

            {/* Image Modal Overlay */}
            {
                selectedImage && (
                    <div
                        className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
                        onClick={() => setSelectedImage(null)}
                    >
                        <div className="relative max-w-full max-h-full">
                            <RemoteImage
                                src={selectedImage}
                                alt="Expanded"
                                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                            />
                            <button
                                className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedImage(null);
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
