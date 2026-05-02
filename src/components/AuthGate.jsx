import React, { useState, useEffect } from 'react';
import { ShieldAlert, KeyRound } from 'lucide-react';

const SECRET_KEY = 'omura119';
const AUTH_STORAGE_KEY = 'omura_saigai_auth';

export default function AuthGate({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const checkAuth = () => {
            const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
            if (savedAuth === 'verified_timestamp') {
                setIsAuthenticated(true);
            }
            setIsChecking(false);
        };
        checkAuth();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (password === SECRET_KEY) {
            localStorage.setItem(AUTH_STORAGE_KEY, 'verified_timestamp');
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('合言葉が違います。正しい合言葉を入力してください。');
            setPassword('');
        }
    };

    if (isChecking) {
        return null;
    }

    if (isAuthenticated) {
        return children;
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
                                    type="password"
                                    required
                                    className="appearance-none block w-full pl-10 px-3 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 sm:text-sm font-medium transition-colors"
                                    placeholder="合言葉を入力"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
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
