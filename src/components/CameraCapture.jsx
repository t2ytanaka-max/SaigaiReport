import React, { useRef, useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { X, Camera, RotateCw } from 'lucide-react';

export function CameraCapture({ onCapture, onClose }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [error, setError] = useState(null);
    const [facingMode, setFacingMode] = useState('environment'); // 'environment' or 'user'
    const [isReady, setIsReady] = useState(false);

    const startCamera = async (mode) => {
        try {
            // 既存のストリームを停止
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: mode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsReady(true);
                setError(null);
            }
        } catch (err) {
            console.error('Camera error:', err);

            // Check if running in LINE browser
            const isLINE = /Line/i.test(navigator.userAgent);

            let errorMessage = 'カメラへのアクセスに失敗しました。';

            // Specific error messages based on error type
            if (err.name === 'NotAllowedError') {
                if (isLINE) {
                    errorMessage = '【LINE内蔵ブラウザではカメラが使用できません】\n\n以下の方法でアプリを開いてください：\n\n1. 画面右上の「︙」または「...」をタップ\n2. 「他のアプリで開く」または「ブラウザで開く」を選択\n3. Chrome、Safari、Firefox等を選択\n\n※ または「アルバム選択」ボタンで写真を選んでください';
                } else {
                    errorMessage = 'カメラの使用が許可されていません。\n\n【解決方法】\n1. ブラウザのアドレスバー左側の鍵マークをタップ\n2. 「権限」→「カメラ」を「許可」に変更\n3. ページを再読み込み';
                }
            } else if (err.name === 'NotFoundError') {
                errorMessage = 'カメラが見つかりませんでした。お使いのデバイスにカメラが接続されているか確認してください。';
            } else if (err.name === 'NotReadableError') {
                errorMessage = 'カメラは他のアプリで使用中です。他のアプリを閉じてから再度お試しください。';
            } else if (err.name === 'SecurityError') {
                errorMessage = 'セキュリティエラー: このサイトはHTTPS接続が必要です。\n\n※ Vercelなどにデプロイ後のHTTPS URLでアクセスしてください。';
            }

            setError(errorMessage);
            setIsReady(false);
        }
    };

    useEffect(() => {
        startCamera(facingMode);

        // クリーンアップ
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [facingMode]);

    const captureImage = () => {
        if (!videoRef.current || !isReady) return;

        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        // 画像を圧縮してBase64に変換
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        // ストリームを停止
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        onCapture(dataUrl);
    };

    const toggleCamera = () => {
        setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent z-10">
                <button
                    onClick={onClose}
                    className="text-white p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                    <X size={24} />
                </button>
                <button
                    onClick={toggleCamera}
                    className="text-white p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                    <RotateCw size={24} />
                </button>
            </div>

            {/* Video Preview */}
            <div className="flex-1 relative flex items-center justify-center">
                {error ? (
                    <div className="text-white text-center p-4 max-w-md">
                        <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">{error}</p>
                        <Button onClick={onClose} variant="secondary">
                            閉じる
                        </Button>
                    </div>
                ) : (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                )}
            </div>

            {/* Capture Button */}
            {!error && (
                <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-center bg-gradient-to-t from-black/50 to-transparent">
                    <button
                        onClick={captureImage}
                        disabled={!isReady}
                        className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        <Camera size={32} className="text-gray-700" />
                    </button>
                </div>
            )}
        </div>
    );
}
