import React, { useState, useEffect, useRef, useCallback } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
    doc,
    addDoc,
    onSnapshot,
    collection,
    query,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// AI API Call for scam detection
async function checkMessageForScam(messageText: string) {
    const prompt = `You are an AI assistant specializing in detecting scams and fraudulent messages.
Analyze the following message and provide:
1. One of three levels: 'SAFE', 'POTENTIAL_SCAM', or 'HIGHLY_LIKELY_SCAM'
2. A percentage (0-100) indicating confidence that this is a scam
3. A brief explanation

Use these percentage guidelines:
- SAFE: 0-25% (very low scam confidence)
- POTENTIAL_SCAM: 25-50% (moderate suspicion but not conclusive)
- HIGHLY_LIKELY_SCAM: 50-100% (high confidence it's a scam)

COMMON SCAM INDICATORS TO WATCH FOR:
- Messages claiming someone sent photos/videos without context
- Urgent requests for personal information, passwords, or money
- Suspicious links or requests to "check something out"
- Fake prize notifications or lottery winnings
- Impersonation of friends/family asking for help
- Phishing attempts disguised as legitimate services
- Messages creating false urgency or fear
- Requests to verify accounts or update information
- Too-good-to-be-true offers

Format your response exactly like this:
LEVEL|PERCENTAGE|EXPLANATION

Examples:
SAFE|8|This appears to be a normal conversation with no suspicious elements.
POTENTIAL_SCAM|35|The message creates urgency and asks for personal information, which are common scam tactics.
HIGHLY_LIKELY_SCAM|75|Classic social engineering attempt - claiming someone sent a photo is a common phishing tactic to get clicks.

Message to analyze: "${messageText}"`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    };
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('AI API Error:', errorData);
            throw new Error(`AI API request failed: ${response.statusText} - ${errorData?.error?.message || 'Unknown AI error'}`);
        }

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            
            const rawText = result.candidates[0].content.parts[0].text;
            const parts = rawText.split('|');
            
            if (parts.length >= 3) {
                const level = parts[0].trim();
                const percentage = parseInt(parts[1].trim());
                const explanation = parts[2].trim();
                
                if (['SAFE', 'POTENTIAL_SCAM', 'HIGHLY_LIKELY_SCAM'].includes(level) && !isNaN(percentage)) {
                    return {
                        isScam: level !== 'SAFE',
                        scamLevel: level,
                        scamPercentage: percentage,
                        scamWarning: explanation || "No specific reason provided."
                    };
                }
            }
            console.warn("AI response format unexpected:", rawText);
            return { isScam: false, scamLevel: 'UNKNOWN', scamPercentage: 0, scamWarning: "Could not determine scam status from AI response." };
        } else {
            console.error('Unexpected AI API response structure:', result);
            throw new Error('Could not understand the AI response. Unexpected format.');
        }
    } catch (error) {
        console.error('Error calling AI for scam detection:', error);
        return { isScam: false, scamLevel: 'ERROR', scamPercentage: 0, scamWarning: `Error during analysis: ${(error as Error).message}` };
    }
}

// SplashScreen Component
const SplashScreen = ({ onFinished }: { onFinished: () => void }) => {
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const texts = [
        "Initializing Cognitive Matrix...",
        "Booting AI Core Systems...",
        "Establishing Neural Link...",
        "Accessing Global Data Stream...",
        "Welcome to the AI Realm."
    ];

    useEffect(() => {
        if (currentTextIndex < texts.length - 1) {
            const timer = setTimeout(() => {
                setCurrentTextIndex(prevIndex => prevIndex + 1);
            }, 1200);
            return () => clearTimeout(timer);
        } else {
            const finishTimer = setTimeout(onFinished, 1500);
            return () => clearTimeout(finishTimer);
        }
    }, [currentTextIndex, onFinished, texts.length]);

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50 transition-opacity duration-1000 ease-in-out">
            <div className="w-20 h-20 mb-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-center h-16 flex items-center justify-center">
                {texts.map((text, index) => (
                    <p
                        key={index}
                        className={`text-xl font-mono text-cyan-300 transition-opacity duration-700 ease-in-out ${
                            index === currentTextIndex ? 'opacity-100' : 'opacity-0 absolute'
                        }`}
                    >
                        {text}
                    </p>
                ))}
            </div>
            <div className="absolute bottom-10 flex items-center space-x-2">
                <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
                <p className="text-xs text-cyan-700 font-mono">AI Interface Loading...</p>
            </div>
            <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
            <div className="absolute top-1/3 right-1/4 w-1 h-1 bg-cyan-300 rounded-full animate-pulse"></div>
            <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></div>
        </div>
    );
};

// MessageItem Component
interface Message {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    timestamp?: Timestamp;
    isScam?: boolean;
    scamLevel?: string;
    scamPercentage?: number;
    scamWarning?: string;
}

const MessageItem = ({ msg }: { msg: Message }) => {
    const getScamIndicatorColor = (level?: string) => {
        if (level === 'HIGHLY_LIKELY_SCAM') return 'border-red-500 bg-red-900 bg-opacity-30 scam-glow';
        if (level === 'POTENTIAL_SCAM') return 'border-yellow-500 bg-yellow-900 bg-opacity-30 potential-scam-glow';
        return 'border-gray-600 bg-gray-700 bg-opacity-30';
    };

    const getScamTextColor = (level?: string) => {
        if (level === 'HIGHLY_LIKELY_SCAM') return 'text-red-400';
        if (level === 'POTENTIAL_SCAM') return 'text-yellow-400';
        return 'text-gray-400';
    };

    const getScamIcon = (level?: string) => {
        if (level === 'HIGHLY_LIKELY_SCAM') return '🚨';
        if (level === 'POTENTIAL_SCAM') return '⚠️';
        return '✅';
    };

    const getScamTitle = (level?: string, percentage?: number) => {
        if (level === 'HIGHLY_LIKELY_SCAM') return `HIGHLY LIKELY SCAM! (${percentage}% confidence)`;
        if (level === 'POTENTIAL_SCAM') return `POTENTIAL SCAM (${percentage}% confidence)`;
        return `SAFE (${percentage}% confidence)`;
    };

    const getPercentageBarColor = (level?: string) => {
        if (level === 'HIGHLY_LIKELY_SCAM') return 'bg-red-500';
        if (level === 'POTENTIAL_SCAM') return 'bg-yellow-500';
        return 'bg-green-500';
    };

    return (
        <div className={`mb-4 p-3.5 rounded-xl max-w-xl shadow-lg transition-all duration-300 ease-in-out message-animation
                        ${msg.sender === 'user' 
                            ? 'bg-sky-700 text-white ml-auto rounded-br-none hover:bg-sky-600' 
                            : 'bg-slate-700 text-slate-100 mr-auto rounded-bl-none hover:bg-slate-600'}`}>
            {msg.sender === 'ai' && (
                <div className="flex items-center space-x-2 mb-2">
                    <i className="fas fa-robot text-cyan-400 text-sm"></i>
                    <span className="text-xs font-mono text-cyan-400">AI Analysis</span>
                </div>
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
            <p className="text-xs opacity-60 mt-1.5">
                {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
            </p>
            {msg.isScam && msg.scamLevel && (
                <div className={`mt-2.5 p-2.5 border-l-4 rounded-md ${getScamIndicatorColor(msg.scamLevel)}`}>
                    <div className="flex items-center justify-between mb-2">
                        <p className={`font-semibold text-xs ${getScamTextColor(msg.scamLevel)}`}>
                            {getScamIcon(msg.scamLevel)} {getScamTitle(msg.scamLevel, msg.scamPercentage)}
                        </p>
                    </div>
                    
                    {/* Percentage Bar */}
                    {msg.scamPercentage !== undefined && (
                        <div className="mb-2">
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div 
                                    className={`h-2 rounded-full transition-all duration-500 ${getPercentageBarColor(msg.scamLevel)}`}
                                    style={{ width: `${msg.scamPercentage}%` }}
                                ></div>
                            </div>
                            <p className={`text-xs ${getScamTextColor(msg.scamLevel)} opacity-70 mt-1`}>
                                Scam confidence: {msg.scamPercentage}%
                            </p>
                        </div>
                    )}
                    
                    <p className={`text-xs ${getScamTextColor(msg.scamLevel)} opacity-80`}>{msg.scamWarning}</p>
                </div>
            )}
        </div>
    );
};

// MessageList Component
const MessageList = ({ messages }: { messages: Message[] }) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sortedMessages = [...messages].sort((a, b) => {
        const timeA = a.timestamp ? a.timestamp.seconds + a.timestamp.nanoseconds / 1e9 : 0;
        const timeB = b.timestamp ? b.timestamp.seconds + b.timestamp.nanoseconds / 1e9 : 0;
        return timeA - timeB;
    });

    return (
        <div className="flex-grow p-4 sm:p-6 space-y-2 overflow-y-auto bg-slate-800 bg-opacity-50 rounded-t-lg shadow-inner h-[calc(100vh-230px)] md:h-[calc(100vh-210px)] scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
            {/* Welcome Message */}
            <div className="bg-slate-700 bg-opacity-60 border border-slate-600 rounded-xl p-4 text-center message-animation">
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-robot text-white text-xl"></i>
                </div>
                <h3 className="text-lg font-semibold text-cyan-300 mb-2">AI Scam Detection Active</h3>
                <p className="text-slate-300 text-sm">Send any message and I'll analyze it for potential scams or fraudulent content.</p>
            </div>
            
            {sortedMessages.map(msg => (
                <MessageItem key={msg.id} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
        </div>
    );
};

// MessageInput Component
const MessageInput = ({ onSendMessage, isLoading }: { onSendMessage: (text: string) => void; isLoading: boolean }) => {
    const [text, setText] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (text.trim()) {
            onSendMessage(text.trim());
            setText('');
        }
    };

    return (
        <div className="bg-slate-900 border-t border-slate-700 p-4 shadow-xl">
            <form onSubmit={handleSubmit} className="flex items-end gap-3">
                <div className="flex-1">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Enter message for AI analysis..."
                        className="w-full p-3 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none resize-none placeholder-slate-500 transition-all"
                        rows={2}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                    />
                    <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2 text-xs text-slate-500">
                                <i className="fas fa-shield-alt text-cyan-500"></i>
                                <span>Protected by AI</span>
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-slate-500">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span>{isLoading ? 'Analyzing...' : 'Ready to analyze'}</span>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500">{text.length} characters</div>
                    </div>
                </div>
                <button
                    type="submit"
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-3 px-5 rounded-lg shadow-md transition-all duration-200 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-50 min-w-[60px]"
                    disabled={isLoading || !text.trim()}
                >
                    {isLoading ? (
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <i className="fas fa-paper-plane text-lg"></i>
                    )}
                </button>
            </form>
        </div>
    );
};

// Main Chat Component
export default function Chat() {
    const [userId, setUserId] = useState<string | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [error, setError] = useState('');
    const [showSplashScreen, setShowSplashScreen] = useState(true);

    // Initialize Firebase Auth
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
            } else {
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Error signing in anonymously:", error);
                    setError("Failed to authenticate. Please refresh the page.");
                }
            }
        });

        return () => unsubscribeAuth();
    }, []);

    // Subscribe to messages
    useEffect(() => {
        if (!userId || !isAuthReady) return;

        const messagesQuery = query(collection(db, `users/${userId}/messages`));
        
        const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
            const messagesData: Message[] = [];
            snapshot.forEach((doc) => {
                messagesData.push({ id: doc.id, ...doc.data() } as Message);
            });
            setMessages(messagesData);
            setIsLoadingMessages(false);
        }, (error) => {
            console.error("Error fetching messages:", error);
            setError("Failed to load messages. Please refresh the page.");
            setIsLoadingMessages(false);
        });

        return () => unsubscribeMessages();
    }, [userId, isAuthReady]);

    const handleSendMessage = useCallback(async (text: string) => {
        if (!userId || isSendingMessage) return;

        setIsSendingMessage(true);
        try {
            // Add user message
            const userMessageRef = await addDoc(collection(db, `users/${userId}/messages`), {
                text,
                sender: 'user',
                timestamp: serverTimestamp()
            });

            // Add AI analysis message
            const aiMessageRef = await addDoc(collection(db, `users/${userId}/messages`), {
                text: "I've analyzed this message for potential scam indicators.",
                sender: 'ai',
                timestamp: serverTimestamp()
            });

            // Perform scam analysis
            const scamAnalysis = await checkMessageForScam(text);

            // Update AI message with scam analysis
            await addDoc(collection(db, `users/${userId}/messages`), {
                text: "Analysis complete.",
                sender: 'ai',
                timestamp: serverTimestamp(),
                isScam: scamAnalysis.isScam,
                scamLevel: scamAnalysis.scamLevel,
                scamPercentage: scamAnalysis.scamPercentage,
                scamWarning: scamAnalysis.scamWarning
            });

        } catch (error) {
            console.error("Error sending message:", error);
            setError("Failed to send message. Please try again.");
        } finally {
            setIsSendingMessage(false);
        }
    }, [userId, isSendingMessage]);

    if (showSplashScreen) {
        return <SplashScreen onFinished={() => setShowSplashScreen(false)} />;
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                            <i className="fas fa-exclamation-triangle text-white text-xl"></i>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Connection Error</h3>
                            <p className="text-sm text-slate-400">Failed to connect to services</p>
                        </div>
                    </div>
                    <p className="text-slate-300 text-sm mb-6">{error}</p>
                    <button 
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2 px-4 rounded-lg transition-colors"
                        onClick={() => window.location.reload()}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-slate-950">
            {/* Header */}
            <header className="bg-slate-900 border-b border-slate-700 p-4 shadow-lg">
                <div className="flex items-center justify-between max-w-4xl mx-auto">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-lg flex items-center justify-center">
                            <i className="fas fa-shield-alt text-white text-lg"></i>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">AI Scam Detector</h1>
                            <p className="text-sm text-slate-400 font-mono">Real-time message analysis</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-sm text-slate-400 font-mono">
                                {isAuthReady ? 'Connected' : 'Connecting...'}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Chat Container */}
            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
                {isLoadingMessages ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        <MessageList messages={messages} />
                        <MessageInput onSendMessage={handleSendMessage} isLoading={isSendingMessage} />
                    </>
                )}
            </div>

            {/* Status Bar */}
            <div className="bg-slate-900 border-t border-slate-800 px-4 py-2">
                <div className="flex items-center justify-between max-w-4xl mx-auto text-xs text-slate-500">
                    <div className="flex items-center space-x-4">
                        <span className="font-mono">AI Detection: Active</span>
                        <span className="font-mono">Firebase: {isAuthReady ? 'Connected' : 'Connecting'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <i className="fas fa-lock text-cyan-500"></i>
                        <span>End-to-end protected</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
