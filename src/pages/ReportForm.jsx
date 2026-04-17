import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GAS_URL } from '../config';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { clsx } from 'clsx';
import { saveDraft, getDraft, clearDraft, addToOutbox, updateStatus, deleteFromOutbox } from '../lib/db';
import { getMyDeviceId } from '../lib/notifications';
import { db_fs, storage } from '../lib/firebase';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Fix for default marker icon in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function LocationMarker({ position, setPosition, isEditMode }) {
    const map = useMapEvents({
        click(e) {
            setPosition(e.latlng);
        },
        locationfound(e) {
            if (!isEditMode) {
                setPosition(e.latlng);
                map.flyTo(e.latlng, map.getZoom());
            }
        },
        locationerror(e) {
            console.warn("Location access denied or failed", e);
        }
    });

    useEffect(() => {
        if (isEditMode) {
            // Edit Mode: Center map on existing position if available
            if (position) {
                map.setView(position, 16);
            }
        } else {
            // New Report: Try to auto-locate
            map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
        }
    }, [map, isEditMode]); // Run once on mount (or if mode changes)

    return position === null ? null : (
        <Marker position={position}></Marker>
    )
}

// Pre-confirm View Component
const ConfirmView = ({ data, onBack, onSend }) => {
    return (
        <div className="space-y-6 pb-24 bg-gray-50 min-h-screen p-4">
            <header className="border-b border-gray-200 pb-2 mb-4">
                <h1 className="text-xl font-bold text-gray-800">報告内容確認</h1>
                <p className="text-sm text-gray-500">以下の内容で報告しますか？</p>
            </header>

            <div className="bg-white p-4 rounded-lg shadow-sm space-y-4">
                <div className="border-b pb-2">
                    <p className="text-xs text-gray-500">報告日時</p>
                    <p className="text-lg font-medium">{data.reportDate.replace('T', ' ')}</p>
                </div>
                <div className="border-b pb-2">
                    <p className="text-xs text-gray-500">所属分団</p>
                    <p className="text-lg font-medium">{data.corp}</p>
                </div>
                <div className="border-b pb-2">
                    <p className="text-xs text-gray-500">災害内容</p>
                    <p className="text-lg font-medium">{data.category} {data.categoryDetail && `(${data.categoryDetail})`}</p>
                </div>
                <div className="border-b pb-2">
                    <p className="text-xs text-gray-500">位置情報</p>
                    <p className="text-lg font-medium">{data.location ? `緯度: ${data.location.lat.toFixed(4)}, 経度: ${data.location.lng.toFixed(4)} ` : '未取得'}</p>
                </div>
                <div className="border-b pb-2">
                    <p className="text-xs text-gray-500">写真</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {data.photos && data.photos.length > 0 ? (
                            data.photos.map((photo, index) => (
                                <img key={index} src={photo} alt={`Photo ${index + 1} `} className="w-20 h-20 object-cover rounded-md border border-gray-200" />
                            ))
                        ) : (
                            <p className="text-lg font-medium">なし</p>
                        )}
                    </div>
                </div>
                <div className="border-b pb-2">
                    <p className="text-xs text-gray-500">追加情報記入</p>
                    <p className="text-lg font-medium whitespace-pre-wrap">{data.memo || 'なし'}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500">活動状況</p>
                    <p className={`text-lg font-medium ${data.status === '対応中' ? 'text-red-600' :
                        data.status === '応急処置済み２次対応者へ引き継ぎ' ? 'text-blue-600' :
                            data.status === '現場確認済み 対応不可' ? 'text-purple-600' :
                                data.status === '現場不明 差戻し' ? 'text-green-600' :
                                    data.status === '終了' ? 'text-black' : 'text-gray-800'
                        }`}>{data.status}</p>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-10 shadow-lg flex gap-3">
                <Button className="flex-1 text-lg h-14" variant="secondary" onClick={onBack}>修正する</Button>
                <Button className="flex-1 text-lg h-14 bg-red-600 hover:bg-red-700" onClick={onSend}>送信する</Button>
            </div>
        </div>
    )
}

// Helper component to preview photos from multiple sources
// Helper component to preview photos from multiple sources
// Helper component to preview photos from multiple sources
const PhotoPreviews = ({ control, existingPhotos = [] }) => {
    // Watch fields within the component to ensure re-renders
    const cameraFiles = useWatch({
        control,
        name: "photos_camera",
    });
    const libraryFiles = useWatch({
        control,
        name: "photos_library",
    });

    const [previewUrls, setPreviewUrls] = useState([]);

    useEffect(() => {
        const allFiles = [
            ...(cameraFiles ? Array.from(cameraFiles) : []),
            ...(libraryFiles ? Array.from(libraryFiles) : [])
        ];

        if (allFiles.length === 0) {
            setPreviewUrls([]);
            return;
        }

        // Create new URLs
        const newUrls = allFiles.map(file => URL.createObjectURL(file));
        setPreviewUrls(newUrls);

        // Cleanup function
        return () => {
            newUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [cameraFiles, libraryFiles]);

    // Combine existing (URLs) + new (Blob URLs) for display
    const displayList = [...(existingPhotos || []), ...previewUrls];

    if (displayList.length === 0) return <p className="col-span-4 text-xs text-gray-400 text-center py-2">写真が選択されていません</p>;

    return displayList.map((src, i) => (
        <img key={i} src={src} alt="Preview" className="w-full h-20 object-cover rounded border border-gray-200" />
    ));
};

export default function ReportForm() {
    const { register, handleSubmit, setValue, watch, getValues, control } = useForm();
    const [position, setPosition] = useState(null);
    const selectedCategory = watch('category');
    const [view, setView] = useState('form'); // 'form' | 'confirm'
    const [formData, setFormData] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();
    const [existingPhotos, setExistingPhotos] = useState([]); // URLs from server
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    const categories = [
        '落石', '土砂崩れ', '倒木', '電柱・電線被害', '停電',
        '暴風被害', '河川氾濫', '冠水', '水路越水', '床下浸水',
        '側溝つまり', '路面に土砂流出', '路面破壊',
        '路面排水宅地流入', 'その他'
    ];

    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const selectedStatus = watch('status');
    const statusOptions = [
        { label: '対応中', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-600' },
        { label: '応急処置済み２次対応者へ引き継ぎ', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-600' },
        { label: '現場確認済み 対応不可', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-600' },
        { label: '現場不明 差戻し', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-600' },
        { label: '終了', color: 'text-black', bg: 'bg-gray-50', border: 'border-gray-400' },
    ];

    const getStatusColor = (status) => {
        const found = statusOptions.find(s => s.label === status);
        return found ? found.color : 'text-gray-800';
    };

    // Load draft OR Edit Data on mount
    useEffect(() => {
        if (location.state && location.state.reportData) {
            // EDIT MODE
            const data = location.state.reportData;
            setFormData(data); // For confirm view if needed, but mainly for inputs

            setValue('corp', data.corp);
            setValue('category', data.category);
            setValue('categoryDetail', data.categoryDetail);
            setValue('memo', data.memo);
            setValue('status', data.status);

            // User requested that updates should rewrite the report time to NOW.
            // So we ignore the original reportDate and set it to current time.
            const now = new Date();
            const str = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setValue('reportDate', str);

            if (data.location) {
                setPosition(data.location);
            }
            if (data.photos && Array.isArray(data.photos)) {
                setExistingPhotos(data.photos);
            }
        } else {
            // NEW MODE: Load draft
            getDraft().then(draft => {
                if (draft && draft.data) {
                    console.log('Restoring draft', draft.data);
                    Object.keys(draft.data).forEach(key => {
                        // skip files for now as they can't be restored easily to input[type=file]
                        if (key !== 'photos' && key !== 'photos_camera' && key !== 'photos_library') {
                            setValue(key, draft.data[key]);
                        }
                    });
                    if (draft.data.location) {
                        setPosition(draft.data.location);
                    }
                    if (draft.data.photos && Array.isArray(draft.data.photos)) {
                        setExistingPhotos(draft.data.photos);
                    }
                }
            });
        }
    }, [location.state, setValue]);

    // Force location permission prompt on Chrome immediately on mount
    useEffect(() => {
        if (navigator.geolocation) {
            console.log("Requesting initial location permission...");
            navigator.geolocation.getCurrentPosition(
                (pos) => { console.log("Permission granted", pos); },
                (err) => { console.warn("Location check failed", err); },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
            );
        }
    }, []);

    // Auto-save
    // Auto-save
    useEffect(() => {
        const subscription = watch(async (value) => {
            // Process photos for draft
            let draftPhotos = [...existingPhotos];

            const processFiles = async (files) => {
                if (!files || files.length === 0) return [];
                return Promise.all(Array.from(files).map(file => fileToBase64(file)));
            };

            const camPhotos = await processFiles(value.photos_camera);
            const libPhotos = await processFiles(value.photos_library);

            draftPhotos = [...draftPhotos, ...camPhotos, ...libPhotos];

            const draftData = { ...value, location: position, photos: draftPhotos };
            saveDraft(draftData);
        });
        return () => subscription.unsubscribe();
    }, [watch, position, existingPhotos]);

    // Set initial date if not present (and no draft loaded yet)
    // Set initial date to NOW when opening the form (unless editing an existing report)
    // Set initial date if not present (and no draft loaded yet)
    // REMOVED: reportDate is now auto-set on confirm/send
    useEffect(() => {
        // logic removed
    }, []);

    // Helper to convert file to Base64 with resizing/compression
    const fileToBase64 = async (file) => {
        return new Promise((resolve, reject) => {
            // Use createImageBitmap if available (more robust on mobile), fallback to FileReader/Image
            if (typeof window.createImageBitmap === 'function') {
                window.createImageBitmap(file)
                    .then(img => {
                        processImage(img, resolve, reject);
                    })
                    .catch(err => {
                        console.warn('createImageBitmap failed, falling back to FileReader', err);
                        fallbackFileReader(file, resolve, reject);
                    });
            } else {
                fallbackFileReader(file, resolve, reject);
            }
        });
    };

    const fallbackFileReader = (file, resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => processImage(img, resolve, reject);
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    };

    const processImage = (img, resolve, reject) => {
        try {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600; // Reduced to 600 to be safe on Samsung/memory-constrained devices
            const MAX_HEIGHT = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            // Ensure integers
            width = Math.floor(width);
            height = Math.floor(height);

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG
            // Note: Some browsers fail if quality is too specific, but 0.6 is usually safe.
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            resolve(dataUrl);
        } catch (e) {
            console.error("Canvas processing failed", e);
            reject(e);
        }
    };

    const onConfirm = async (data) => {
        // Collect files from both inputs
        const cameraFiles = data.photos_camera ? Array.from(data.photos_camera) : [];
        const libraryFiles = data.photos_library ? Array.from(data.photos_library) : [];
        const allFiles = [...cameraFiles, ...libraryFiles];

        // Convert photos to Base64
        let photoData = [];
        if (allFiles.length > 0) {
            photoData = await Promise.all(
                allFiles.map(file => fileToBase64(file))
            );
        }

        // Merge with existing photos (from server or draft)
        const finalPhotos = [...existingPhotos, ...photoData];

        // Auto-set reportDate to NOW (since input is removed)
        const now = new Date();
        const isoDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

        // Determine ID strategy
        const originalId = location.state?.reportData?.id;

        // 【修正】不要なFileListオブジェクトを除外する
        // photos_camera と photos_library は firebase には送れないため削除
        const { photos_camera, photos_library, ...cleanData } = data;

        const reportData = {
            ...cleanData,
            id: originalId,
            reportDate: isoDate,
            photos: finalPhotos,
            location: position ? { lat: Number(position.lat), lng: Number(position.lng) } : null,
            deviceId: getMyDeviceId()
        }

        if (!originalId) {
            delete reportData.id;
        }

        setFormData(reportData);
        setView('confirm');
    };

    const onSend = async () => {
        if (!formData) return;

        // Auto-refresh date to exact send time (as requested)
        const now = new Date();
        const sendDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        const finalFormData = { ...formData, reportDate: sendDate };
        try {
            // 1. Always save to Outbox first (Offline First)
            // 【修正】ここでもデータを浄化（プロトタイプ等の除去）してから保存する
            const { photos_camera, photos_library, ...outboxSafeData } = JSON.parse(JSON.stringify(finalFormData));
            const id = await addToOutbox(outboxSafeData);

            // Slight delay to ensure DB write before navigation (though await should handle it)
            // setTimeout(() => navigate('/'), 100); // Removed this line as it navigates too early

            // 2. Try to sync immediately if online
            if (navigator.onLine) {
                try {
                    // Firebase Upload Logic
                    const reportId = id;
                    const updatedPhotos = [];

                    // 2a. Upload Photos to Firebase Storage
                    if (finalFormData.photos && finalFormData.photos.length > 0) {
                        for (let i = 0; i < finalFormData.photos.length; i++) {
                            const photoStr = finalFormData.photos[i];
                            // Only upload if it's base64 data
                            if (photoStr.startsWith('data:')) {
                                const photoRef = ref(storage, `photos/${reportId}/${i}.jpg`);
                                await uploadString(photoRef, photoStr, 'data_url');
                                const downloadURL = await getDownloadURL(photoRef);
                                updatedPhotos.push(downloadURL);
                            } else {
                                // Already a URL (e.g. from existing photos in Edit mode)
                                updatedPhotos.push(photoStr);
                            }
                        }
                    }

                    // 2b. Save Report to Firestore
                    // 【重要】Firestoreに保存できない生データや隠れた特殊オブジェクトを確実に排除する
                    // JSON化して戻すことで、純粋なJavaScriptオブジェクト（POJO）に強制変換します
                    const { photos_camera, photos_library, ...finalCleanData } = JSON.parse(JSON.stringify(finalFormData));

                    const firestoreData = {
                        ...finalCleanData,
                        photos: updatedPhotos,
                        timestamp: Date.now(),
                        deviceId: getMyDeviceId(),
                        updated_at: serverTimestamp(),
                    };

                    if (!db_fs) throw new Error("Firebaseが初期化されていません。");

                    await setDoc(doc(db_fs, "reports", reportId), firestoreData);

                    // Mark as synced by deleting from temporary local outbox
                    if (id) {
                        await deleteFromOutbox(id);
                    }
                    alert('サーバー（Firebase）へ送信が完了しました！');
                } catch (e) {
                    console.error("Firebase Sync failed", e);
                    alert('通信トラブルのためサーバー送信に失敗しましたが、端末（履歴）には保存されました。電波の良い場所で再試行してください。\nエラー内容: ' + e.message);
                }
            } else {
                alert('オフラインのため送信キューに保存しました。通信回復時に再送してください。');
            }

            await clearDraft(); // Clear the draft
            navigate('/'); // Go to history (now root)
        } catch (e) {
            console.error(e);
            alert('保存に失敗しました。');
        }
    }

    if (view === 'confirm' && formData) {
        return <ConfirmView data={formData} onBack={() => setView('form')} onSend={onSend} />;
    }

    return (
        <div className="max-w-md mx-auto p-4 space-y-6 pb-24 bg-gray-50 min-h-screen">
            <header className="border-b border-gray-200 pb-3 mb-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-black text-gray-800 leading-none">災害状況入力</h1>
                    </div>
                    <Link to="/">
                        <Button variant="outline" size="sm" className="text-blue-600 gap-1 h-9 px-3 bg-blue-50 border-blue-100 hover:bg-blue-100 font-bold shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.007 12.75H3.75v-.008h.007v.008zm0-6.75H3.75v-.008h.007v.008z" />
                            </svg>
                            履歴
                        </Button>
                    </Link>
                </div>
            </header>

            <form onSubmit={handleSubmit(onConfirm)} className="space-y-6">
                {/* Date Input Removed - Auto set on send */}

                {/* Corp */}
                <section className="bg-white p-4 rounded-lg shadow-sm">
                    <label className="block text-sm font-bold text-gray-700 mb-2">所属分団 <span className="text-red-600 text-xs ml-1">必須</span></label>
                    <select className="flex h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600" {...register('corp', { required: true })}>
                        <option value="">選択してください</option>
                        <option value="1分団（久原）">1分団（久原）</option>
                        <option value="1分団（前船津）">1分団（前船津）</option>
                        <option value="2分団">2分団</option>
                        <option value="3分団">3分団</option>
                        <option value="4分団（武部）">4分団（武部）</option>
                        <option value="4分団（大多武）">4分団（大多武）</option>
                        <option value="5分団">5分団</option>
                        <option value="6分団">6分団</option>
                        <option value="7分団">7分団</option>
                        <option value="8分団">8分団</option>
                        <option value="9分団">9分団</option>
                        <option value="10分団">10分団</option>
                        <option value="11分団（皆同）">11分団（皆同）</option>
                        <option value="11分団（立福寺）">11分団（立福寺）</option>
                        <option value="11分団（梶ノ尾）">11分団（梶ノ尾）</option>
                        <option value="12分団（武留路）">12分団（武留路）</option>
                        <option value="12分団（久津）">12分団（久津）</option>
                        <option value="13分団（日泊）">13分団（日泊）</option>
                        <option value="13分団（西部）">13分団（西部）</option>
                        <option value="13分団（今村）">13分団（今村）</option>
                        <option value="13分団（溝陸）">13分団（溝陸）</option>
                        <option value="14分団（二本松）">14分団（二本松）</option>
                        <option value="14分団（中里）">14分団（中里）</option>
                        <option value="14分団（陰平）">14分団（陰平）</option>
                        <option value="15分団（田下）">15分団（田下）</option>
                        <option value="15分団（黒木）">15分団（黒木）</option>
                        <option value="その他">その他</option>
                    </select>
                </section>

                {/* Category */}
                <section className="bg-white p-4 rounded-lg shadow-sm">
                    <label className="block text-sm font-bold text-gray-700 mb-2">災害内容 <span className="text-red-600 text-xs ml-1">必須</span></label>

                    <button
                        type="button"
                        onClick={() => setIsCategoryModalOpen(true)}
                        className={`flex items-center justify-between w-full h-12 px-3 py-2 border rounded-md text-base ${selectedCategory ? 'bg-white border-gray-300 text-gray-900' : 'bg-white border-gray-300 text-gray-500'
                            } focus:outline-none focus:ring-2 focus:ring-red-600`}
                    >
                        <span>{selectedCategory || '選択してください'}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                    </button>

                    {/* Category Selection Modal */}
                    {isCategoryModalOpen && (
                        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                            <div className="bg-white rounded-lg w-full max-w-sm max-h-[80vh] flex flex-col shadow-xl">
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                                    <h3 className="font-bold text-lg text-gray-800">災害内容を選択</h3>
                                    <button
                                        type="button"
                                        onClick={() => setIsCategoryModalOpen(false)}
                                        className="text-gray-400 hover:text-gray-600 p-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="overflow-y-auto p-2">
                                    <div className="space-y-1">
                                        {categories.map((cat) => (
                                            <label
                                                key={cat}
                                                className={`flex items-center space-x-3 p-3 rounded-md cursor-pointer transition-colors ${selectedCategory === cat ? 'bg-red-50 text-red-700 font-bold' : 'hover:bg-gray-50 text-gray-700'
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedCategory === cat ? 'border-red-600' : 'border-gray-300'
                                                    }`}>
                                                    {selectedCategory === cat && <div className="w-2.5 h-2.5 rounded-full bg-red-600" />}
                                                </div>
                                                <input
                                                    type="radio"
                                                    value={cat}
                                                    {...register('category', { required: true })}
                                                    className="sr-only"
                                                    onClick={() => {
                                                        // Close modal shortly after selection for better UX
                                                        setTimeout(() => setIsCategoryModalOpen(false), 200);
                                                    }}
                                                />
                                                <span className="flex-1">{cat}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                                    <Button
                                        type="button"
                                        className="w-full bg-gray-800 text-white"
                                        onClick={() => setIsCategoryModalOpen(false)}
                                    >
                                        閉じる
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedCategory === 'その他' && (
                        <div className="mt-3">
                            <Input placeholder="詳細を入力" {...register('categoryDetail')} />
                        </div>
                    )}
                </section>

                {/* Location */}
                <section className="bg-white p-4 rounded-lg shadow-sm">
                    <label className="block text-sm font-bold text-gray-700 mb-2">位置情報 <span className="text-red-600 text-xs ml-1">自動マーキング 手動変更も可能</span></label>
                    <div className="h-64 rounded-md border border-gray-300 overflow-hidden relative z-0">
                        <MapContainer center={[35.6895, 139.6917]} zoom={13} style={{ height: '100%', width: '100%' }}>
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <LocationMarker
                                position={position}
                                setPosition={setPosition}
                                isEditMode={!!location.state?.reportData}
                            />
                        </MapContainer>
                    </div>
                    <div className="mt-2 flex justify-between items-center bg-gray-50 p-2 rounded">
                        <p className="text-xs text-gray-500 flex items-center">
                            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-1"></span>
                            地図をタップして位置を修正できます
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                // Find the Leaflet map instance and call locate
                                // Since we can't easily access map instance here without context, 
                                // we might need to rely on the user reloading page or check permission.
                                // A better way is to move the button INSIDE the MapContainer but that styles it awkwardly.
                                // Ideally LocationMarker should expose a ref or we add a control.
                                // For now, let's suggest reloading.
                                location.reload();
                            }}
                        >
                            現在地を再取得
                        </Button>
                    </div>
                </section>

                {/* Photo */}
                <section className="bg-white p-4 rounded-lg shadow-sm">
                    <label className="block text-sm font-bold text-gray-700 mb-2">写真</label>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                        {/* Camera Button */}
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                id="camera-input"
                                className="hidden"
                                {...register('photos_camera')}
                            />
                            <label
                                htmlFor="camera-input"
                                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors bg-white h-32 active:bg-gray-200"
                            >
                                <span className="text-2xl mb-1">📷</span>
                                <span className="text-sm font-bold text-gray-700">写真を撮影</span>
                            </label>
                        </div>

                        {/* Library Button */}
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                id="library-input"
                                className="hidden"
                                {...register('photos_library')}
                            />
                            <label
                                htmlFor="library-input"
                                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors bg-white h-32 active:bg-gray-200"
                            >
                                <span className="text-2xl mb-1">🖼️</span>
                                <span className="text-sm font-bold text-gray-700">アルバム選択</span>
                            </label>
                        </div>
                    </div>
                    {/* Preview Area (Consolidated) */}
                    <div className="mt-3 grid grid-cols-4 gap-2">
                        {/* We need to display previews from both inputs. 
                             Since react-hook-form 'watch' is easy, let's use that. 
                         */}
                        <PhotoPreviews control={control} existingPhotos={formData?.photos} />
                    </div>
                </section>

                {/* Status */}
                <section className="bg-white p-4 rounded-lg shadow-sm">
                    <label className="block text-sm font-bold text-gray-700 mb-2">活動状況 <span className="text-red-600 text-xs ml-1">必須</span></label>

                    <button
                        type="button"
                        onClick={() => setIsStatusModalOpen(true)}
                        className={`flex items-center justify-between w-full h-12 px-3 py-2 border rounded-md text-base ${selectedStatus ? `bg-white border-gray-300 font-bold ${getStatusColor(selectedStatus)}` : 'bg-white border-gray-300 text-gray-500'
                            } focus:outline-none focus:ring-2 focus:ring-red-600`}
                    >
                        <span>{selectedStatus || '選択してください'}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                    </button>

                    {/* Status Selection Modal */}
                    {isStatusModalOpen && (
                        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                            <div className="bg-white rounded-lg w-full max-w-sm max-h-[80vh] flex flex-col shadow-xl">
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                                    <h3 className="font-bold text-lg text-gray-800">活動状況を選択</h3>
                                    <button
                                        type="button"
                                        onClick={() => setIsStatusModalOpen(false)}
                                        className="text-gray-400 hover:text-gray-600 p-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="overflow-y-auto p-2">
                                    <div className="space-y-2">
                                        {statusOptions.map((opt) => (
                                            <label
                                                key={opt.label}
                                                className={`flex items-center space-x-3 p-4 rounded-md cursor-pointer transition-colors border ${selectedStatus === opt.label
                                                    ? `${opt.bg} ${opt.border}`
                                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedStatus === opt.label ? opt.border : 'border-gray-300'
                                                    }`}>
                                                    {selectedStatus === opt.label && <div className={`w-2.5 h-2.5 rounded-full ${opt.color.replace('text-', 'bg-')}`} />}
                                                </div>
                                                <input
                                                    type="radio"
                                                    value={opt.label}
                                                    {...register('status', { required: true })}
                                                    className="sr-only"
                                                    onClick={() => {
                                                        setTimeout(() => setIsStatusModalOpen(false), 200);
                                                    }}
                                                />
                                                <span className={`font-bold ${opt.color}`}>{opt.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                                    <Button
                                        type="button"
                                        className="w-full bg-gray-800 text-white"
                                        onClick={() => setIsStatusModalOpen(false)}
                                    >
                                        閉じる
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* Memo */}
                <section className="bg-white p-4 rounded-lg shadow-sm">
                    <label className="block text-sm font-bold text-gray-700 mb-2">追加情報記入 <span className="text-blue-600 text-xs ml-1">任意</span></label>
                    <textarea className="flex w-full min-h-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600" {...register('memo')} placeholder="被害状況など"></textarea>
                </section>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-10 shadow-lg">
                    <Button type="submit" className="w-full text-lg h-14 bg-red-600 hover:bg-red-700 shadow-md" size="lg">確認画面へ</Button>
                </div>

                {/* Footer with Version Indicator */}
                <footer className="mt-8 mb-24 py-6 border-t border-gray-100 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-gray-300">
                        <div className="w-6 h-px bg-gray-100"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Fire Corps Report System</span>
                        <div className="w-6 h-px bg-gray-100"></div>
                    </div>
                    <div className="bg-gray-50 px-3 py-1 rounded-full border border-gray-100 shadow-inner">
                        <span className="text-[10px] text-gray-400 font-black tracking-widest">SYSTEM VERSION: v1.5.2</span>
                    </div>
                </footer>
            </form>
        </div>
    );
}
