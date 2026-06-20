import React, { useState, useEffect } from 'react';
import { ShieldAlert, KeyRound, Eye, EyeOff } from 'lucide-react';

const SECRET_KEY = 'omura119';
const AUTH_STORAGE_KEY = 'omura_saigai_auth';

export default function AuthGate({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isChecking, setIsChecking] = useState(true);
    
    // ポリシー同意用のステート
    const [isPolicyAgreed, setIsPolicyAgreed] = useState(false);
    const [policyData, setPolicyData] = useState(null);
    const [canAgree, setCanAgree] = useState(false);

    useEffect(() => {
        const checkAuth = () => {
            const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
            if (savedAuth === 'verified_timestamp') {
                setIsAuthenticated(true);
            }
            const savedAgreement = localStorage.getItem('saigai_policy_agreed') === 'true';
            setIsPolicyAgreed(savedAgreement);
            setIsChecking(false);
        };
        checkAuth();

        // 共通のポリシーJSONを読み込む
        fetch('/security_policy.json')
            .then(res => res.json())
            .then(data => setPolicyData(data))
            .catch(err => console.error('Failed to load policy:', err));
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (password === SECRET_KEY) {
            localStorage.setItem(AUTH_STORAGE_KEY, 'verified_timestamp');
            setIsAuthenticated(true);
            const savedAgreement = localStorage.getItem('saigai_policy_agreed') === 'true';
            setIsPolicyAgreed(savedAgreement);
            setError('');
        } else {
            setError('合言葉が違います。正しい合言葉を入力してください。');
            setPassword('');
        }
    };

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        // 一番下までスクロールしたかを判定（1px〜2px程度の誤差を考慮）
        if (scrollHeight - scrollTop - clientHeight <= 3) {
            setCanAgree(true);
        }
    };

    const handleAgree = () => {
        localStorage.setItem('saigai_policy_agreed', 'true');
        setIsPolicyAgreed(true);
    };

    const handleDisagree = () => {
        alert('セキュリティポリシーに同意いただけない場合は、本システムを利用できません。');
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setIsAuthenticated(false);
        setPassword('');
        setCanAgree(false); // ボタン状態もリセット
    };

    if (isChecking) {
        return null;
    }

    if (isAuthenticated && isPolicyAgreed) {
        return children;
    }

    if (isAuthenticated && !isPolicyAgreed) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8 font-sans">
                <div className="sm:mx-auto sm:w-full sm:max-w-lg">
                    <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-orange-50 shadow-sm border border-orange-100 overflow-hidden">
                        <img src="/pwa-192x192.png" alt="Live大村市消防団" className="h-full w-full object-cover" />
                    </div>
                    <h2 className="mt-4 text-center text-xl font-black text-gray-900 tracking-tight">
                        {policyData?.title || 'セキュリティポリシー'}
                    </h2>
                    <p className="mt-2 text-center text-xs text-red-500 font-bold bg-red-50 py-1.5 px-3 rounded-lg max-w-sm mx-auto border border-red-100">
                        ※本システムを利用するには同意が必要です。
                    </p>
                </div>

                <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg">
                    <div className="bg-white py-6 px-4 shadow-xl rounded-2xl border border-gray-100 sm:px-10 flex flex-col gap-4">
                        {/* 本文エリア（スクロール監視） */}
                        <div 
                            onScroll={handleScroll}
                            className="bg-gray-50 border border-gray-200 rounded-xl p-4 h-72 overflow-y-auto text-xs text-gray-700 flex flex-col gap-4 select-none"
                            style={{ scrollbarWidth: 'thin' }}
                        >
                            {policyData ? (
                                <>
                                    <p className="font-bold leading-relaxed">{policyData.preamble}</p>
                                    {policyData.sections.map((section, idx) => (
                                        <div key={idx} className="flex flex-col gap-1.5 text-left">
                                            <h3 className="font-black text-gray-900 border-l-4 border-orange-500 pl-2 text-sm">{section.title}</h3>
                                            {section.text && <p className="leading-relaxed whitespace-pre-wrap">{section.text}</p>}
                                            {section.sub && (
                                                <div className="flex flex-col gap-2 pl-2">
                                                    {section.sub.map((sub, sidx) => (
                                                        <div key={sidx} className="flex flex-col gap-1">
                                                            <h4 className="font-bold text-gray-800">{sub.title}</h4>
                                                            <p className="leading-relaxed whitespace-pre-wrap">{sub.text}</p>
                                                            {sub.bullets && (
                                                                <ul className="list-disc pl-4 flex flex-col gap-0.5 text-gray-600">
                                                                    {sub.bullets.map((b, bidx) => <li key={bidx}>{b}</li>)}
                                                                </ul>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {section.bullets && (
                                                <ul className="list-disc pl-4 flex flex-col gap-0.5 text-gray-600">
                                                    {section.bullets.map((b, bidx) => <li key={bidx}>{b}</li>)}
                                                </ul>
                                            )}
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div className="text-center py-10 font-bold text-gray-400">ポリシーを読み込み中...</div>
                            )}
                        </div>

                        {/* 同意・非同意ボタン */}
                        <div className="flex flex-col gap-2 mt-2">
                            <div className="text-[10px] text-center text-gray-400 font-bold">
                                {!canAgree && "※一番下までスクロールすると「同意する」ボタンが押せるようになります。"}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleDisagree}
                                    className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-xl font-bold text-sm bg-white hover:bg-gray-50 active:scale-95 transition-all"
                                >
                                    同意しない
                                </button>
                                <button
                                    onClick={handleAgree}
                                    disabled={!canAgree}
                                    className={`flex-1 py-3 rounded-xl font-black text-sm transition-all active:scale-95 ${
                                        canAgree 
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200' 
                                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    同意する
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="mx-auto flex items-center justify-center h-28 w-28 rounded-full bg-orange-50 shadow-sm border border-orange-100 overflow-hidden">
                    <img src="/pwa-192x192.png" alt="Live大村市消防団" className="h-full w-full object-cover" />
                </div>
                <h2 className="mt-6 text-center text-2xl font-black text-gray-900 tracking-tight">
                    Live大村市消防団
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600 font-medium">
                    関係者専用システム
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
                <div className="bg-white py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-gray-100">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="password" className="block text-sm font-bold text-gray-700">
                                アクセス合言葉
                            </label>
                            <div className="mt-2 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <KeyRound className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    className="appearance-none block w-full pl-10 pr-10 px-3 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 sm:text-sm font-medium transition-colors"
                                    placeholder="合言葉を入力"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                                    ) : (
                                        <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-md bg-red-50 p-4 border border-red-200">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <ShieldAlert className="h-5 w-5 text-red-400" aria-hidden="true" />
                                    </div>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">{error}</h3>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-black text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
                            >
                                システムにアクセス
                            </button>
                        </div>
                    </form>
                    
                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-gray-500 font-medium">
                                    緊急時の迅速な情報共有のために
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
