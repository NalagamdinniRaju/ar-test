import React, { useState, useCallback, useEffect, useRef } from 'react';

// --- A-FRAME/AR.JS CUSTOM ELEMENTS TYPING FIX ---
declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'a-scene': any;
            'a-assets': any;
            'a-asset-item': any;
            'a-marker': any;
            'a-entity': any;
            'a-text': any;
            'model-viewer': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement>,
                HTMLElement
            > & {
                src?: string;
                'ios-src'?: string;
                ar?: boolean;
                'ar-modes'?: string;
                'ar-scale'?: string;
                'ar-placement'?: string;
                'camera-controls'?: boolean;
                'touch-action'?: string;
                alt?: string;
                'shadow-intensity'?: string | number;
                'shadow-softness'?: string | number;
                exposure?: string | number;
                'interaction-prompt'?: string;
                'min-camera-orbit'?: string;
                'max-camera-orbit'?: string;
                'camera-orbit'?: string;
                'field-of-view'?: string;
                scale?: string;
                'auto-rotate'?: boolean;
                'rotation-per-second'?: string;
                onLoad?: (e: any) => void;
                'onAr-status'?: (e: any) => void;
                'onModel-visibility'?: (e: any) => void;
                'onCamera-change'?: (e: any) => void;
            };
        }
    }
}

const BASE_MODEL_URL = '/public/sofa_v4.glb';
const BASE_USDZ_URL = '/public/sofa_v4.usdz';

interface Customization {
    color: string;
    scale: number;
    pattern?: string;
    material?: string;
}

interface Dimensions {
    width: number;
    height: number;
    depth: number;
}

interface FitCheckResult {
    fits: boolean;
    message: string;
    icon: string;
    color: string;
}

type ARStatus =
    | 'idle'
    | 'detecting'
    | 'ready'
    | 'placed'
    | 'session-started'
    | 'failed';

const parseUrlParams = (): Customization => {
    const params = new URLSearchParams(window.location.search);
    return {
        color: params.get('color') || '#FFFFFF',
        scale: parseFloat(params.get('scale') || '1.0'),
        pattern: params.get('pattern') || 'solid',
        material: params.get('material') || 'default',
    };
};

const isMobileDevice = (): boolean => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

const isIOSDevice = (): boolean => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

const supportsWebXR = async (): Promise<boolean> => {
    if ('xr' in navigator) {
        try {
            return await (navigator as any).xr.isSessionSupported(
                'immersive-ar'
            );
        } catch {
            return false;
        }
    }
    return false;
};

export default function ProductARViewer() {
    const [isMobile, setIsMobile] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [webXRSupported, setWebXRSupported] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [customizations, setCustomizations] = useState<Customization>({
        color: '#FFFFFF',
        scale: 1.0,
        pattern: 'solid',
        material: 'default',
    });
    const [arStatus, setArStatus] = useState<ARStatus>('idle');
    const [captureEnabled, setCaptureEnabled] = useState(false);
    const [showMeasurements, setShowMeasurements] = useState(false);
    const [dimensions, setDimensions] = useState<Dimensions | null>(null);
    const [fitCheckResult, setFitCheckResult] = useState<FitCheckResult | null>(
        null
    );
    const [customUSDZUrl, setCustomUSDZUrl] = useState<string>('');
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);
    const [captureStatus, setCaptureStatus] = useState<string>('');

    const modelViewerRef = useRef<HTMLElement | null>(null);
    const arButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        const initialize = async () => {
            const mobile = isMobileDevice();
            const ios = isIOSDevice();
            const webXR = await supportsWebXR();

            setIsMobile(mobile);
            setIsIOS(ios);
            setWebXRSupported(webXR);
            setCustomizations(parseUrlParams());

            const scriptId = 'model-viewer-script';
            if (!document.getElementById(scriptId)) {
                const script = document.createElement('script');
                script.src =
                    'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
                script.type = 'module';
                script.id = scriptId;
                document.head.appendChild(script);

                // Wait for script to load
                script.onload = () => {
                    console.log('Model Viewer loaded successfully');
                };
            }
        };

        initialize();
    }, []);

    useEffect(() => {
        if (isIOS && customizations.color !== '#FFFFFF') {
            // In production, this should call a server endpoint
            // For now, we'll use the base USDZ with a query parameter hint
            const customUrl = `${BASE_USDZ_URL}?color=${encodeURIComponent(customizations.color)}&scale=${customizations.scale}`;
            setCustomUSDZUrl(customUrl);
        } else {
            setCustomUSDZUrl(BASE_USDZ_URL);
        }
    }, [isIOS, customizations]);

    useEffect(() => {
        if (!dimensions) return;

        // Simulate space detection (in production, use WebXR hit-test API)
        const estimatedRoomWidth = 4; // meters
        const estimatedRoomHeight = 2.8; // meters
        const estimatedRoomDepth = 5; // meters

        const { width, height, depth } = dimensions;

        // Calculate if object fits
        const widthFit = width <= estimatedRoomWidth;
        const heightFit = height <= estimatedRoomHeight;
        const depthFit = depth <= estimatedRoomDepth;

        const allFit = widthFit && heightFit && depthFit;

        // Calculate space usage percentage
        const spaceUsage = Math.max(
            (width / estimatedRoomWidth) * 100,
            (height / estimatedRoomHeight) * 100,
            (depth / estimatedRoomDepth) * 100
        );

        let result: FitCheckResult;

        if (!allFit) {
            result = {
                fits: false,
                message: 'Object may not fit here - Too large for space',
                icon: '⚠️',
                color: '#ef4444', // red
            };
        } else if (spaceUsage > 80) {
            result = {
                fits: true,
                message: 'Tight fit - Limited space around object',
                icon: '⚡',
                color: '#f59e0b', // amber
            };
        } else if (spaceUsage > 60) {
            result = {
                fits: true,
                message: 'Good fit - Comfortable space',
                icon: '✓',
                color: '#10b981', // green
            };
        } else {
            result = {
                fits: true,
                message: 'Perfect fit - Plenty of space!',
                icon: '✓',
                color: '#10b981', // green
            };
        }

        setFitCheckResult(result);
        if ('vibrate' in navigator && result.fits) {
            navigator.vibrate(50); // Short vibration for confirmation
        }
    }, [dimensions]);

    const handleModelLoad = useCallback((e: any) => {
        console.log('Model loaded');
        setIsModelLoaded(true);
        setCaptureEnabled(true);
        modelViewerRef.current = e.target;
        setTimeout(() => {
            setShowInstructions(false);
        }, 5000);
    }, []);

    const handleARStatus = useCallback((e: any) => {
        const status = e.detail.status;
        console.log('AR Status:', status);

        if (status === 'not-presenting') {
            setArStatus('idle');
            setShowMeasurements(false);
        } else if (status === 'session-started') {
            setArStatus('session-started');
            setShowMeasurements(true);
            if ('vibrate' in navigator) {
                navigator.vibrate([50, 100, 50]);
            }
        } else if (status === 'object-placed') {
            setArStatus('placed');
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
        } else if (status === 'failed') {
            setArStatus('failed');
            alert('AR session failed. Please try again.');
        }
    }, []);

    const captureARImage = useCallback(async () => {
        const modelViewer = modelViewerRef.current as any;

        if (!modelViewer) {
            alert('Model viewer not ready');
            return;
        }

        try {
            setCaptureStatus('Capturing...');

            // Create high-resolution blob
            const blob = await modelViewer.toBlob({
                idealAspect: true,
                mimeType: 'image/png',
            });

            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.href = url;
            link.download = `ar-product-${timestamp}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setCaptureStatus('Image saved! ✓');

            // Haptic feedback on capture
            if ('vibrate' in navigator) {
                navigator.vibrate([50, 50, 50]);
            }

            // Clear status after 2 seconds
            setTimeout(() => {
                setCaptureStatus('');
            }, 2000);
        } catch (error) {
            console.error('Capture failed:', error);
            setCaptureStatus('Capture failed ✗');
            setTimeout(() => {
                setCaptureStatus('');
            }, 2000);
        }
    }, []);

    const handleViewInARClick = () => {
        if (isMobile) {
            setShowConfirmation(true);
        } else {
            console.log('Desktop: QR code displayed automatically');
        }
    };

    const handleConfirmation = (allow: boolean) => {
        setShowConfirmation(false);
        if (allow) {
            const modelViewer = modelViewerRef.current as any;
            if (modelViewer && modelViewer.canActivateAR) {
                setArStatus('detecting');
                modelViewer.activateAR();
            } else {
                alert('AR not available on this device');
            }
        }
    };

    const toggleMeasurements = () => {
        setShowMeasurements(!showMeasurements);
    };
    return (
        <div className='container'>
            {/* Header */}
            {/* <div style={{ textAlign: 'center', marginBottom: '2rem', color: 'white' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem' }}>
                    AR Product Viewer
                </h1>
                <p style={{ fontSize: '1.125rem', opacity: 0.9 }}>
                    Experience your customized product in augmented reality
                </p>
            </div> */}

            {/* Instruction Banner */}
            {showInstructions && (
                <div className='instruction-banner closable'>
                    <button
                        className='close-instructions'
                        onClick={() => setShowInstructions(false)}
                        aria-label='Close instructions'
                    >
                        ×
                    </button>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'start',
                            gap: '12px',
                        }}
                    >
                        <span style={{ fontSize: '24px' }}>
                            {isMobile ? '📱' : '🖥️'}
                        </span>
                        <div>
                            <h3
                                style={{
                                    margin: '0 0 8px 0',
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    color: '#1f2937',
                                }}
                            >
                                {isMobile
                                    ? 'Mobile: Tap to Enter AR'
                                    : 'Desktop: Scan QR Code'}
                            </h3>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: '14px',
                                    color: '#6b7280',
                                    lineHeight: '1.6',
                                }}
                            >
                                {isMobile
                                    ? 'Use one finger to rotate, pinch to zoom, then tap View in AR to see it in your space.'
                                    : 'Scan the QR code with your mobile device to view in AR. On desktop, drag with mouse to rotate the model.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {fitCheckResult && (
                <div
                    className='fit-check-banner'
                    style={{
                        backgroundColor: `${fitCheckResult.color}15`,
                        border: `2px solid ${fitCheckResult.color}40`,
                        color: fitCheckResult.color,
                    }}
                >
                    <span style={{ fontSize: '24px' }}>
                        {fitCheckResult.icon}
                    </span>
                    <span>{fitCheckResult.message}</span>
                </div>
            )}

            {dimensions && showMeasurements && (
                <div
                    className='info-card'
                    style={{ marginTop: '1rem', marginBottom: '1rem' }}
                >
                    <h3
                        style={{
                            margin: '0 0 12px 0',
                            fontSize: '16px',
                            fontWeight: '700',
                            color: '#1f2937',
                        }}
                    >
                        📏 Product Dimensions (at {customizations.scale}x scale)
                    </h3>
                    <div
                        style={{
                            display: 'flex',
                            gap: '12px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <div className='dimension-badge'>
                            Width:{' '}
                            <strong>{dimensions.width.toFixed(2)}m</strong>
                        </div>
                        <div className='dimension-badge'>
                            Height:{' '}
                            <strong>{dimensions.height.toFixed(2)}m</strong>
                        </div>
                        <div className='dimension-badge'>
                            Depth:{' '}
                            <strong>{dimensions.depth.toFixed(2)}m</strong>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ position: 'relative' }}>
                <model-viewer
                    src={BASE_MODEL_URL}
                    ios-src={customUSDZUrl || BASE_USDZ_URL}
                    ar
                    ar-modes='webxr scene-viewer quick-look'
                    ar-scale='auto'
                    ar-placement='floor'
                    camera-controls
                    touch-action='pan-y'
                    alt='Customizable 3D product in augmented reality'
                    shadow-intensity='1'
                    shadow-softness='0.5'
                    exposure='1.0'
                    interaction-prompt='auto'
                    camera-orbit='0deg 75deg 105%'
                    field-of-view='30deg'
                    min-camera-orbit='auto auto 5%'
                    max-camera-orbit='auto auto 500%'
                    onLoad={handleModelLoad}
                    onAr-status={handleARStatus}
                >
                    {captureEnabled && (
                        <button
                            className='capture-button'
                            onClick={captureARImage}
                            disabled={!isModelLoaded}
                        >
                            <span>📸</span>
                            <span>Capture</span>
                        </button>
                    )}

                    {dimensions && (
                        <button
                            className='measurements-toggle'
                            onClick={toggleMeasurements}
                        >
                            📏 {showMeasurements ? 'Hide' : 'Show'} Dimensions
                        </button>
                    )}

                    {isMobile && (
                        <button
                            slot='ar-button'
                            className='ar-button'
                            ref={arButtonRef}
                            onClick={handleViewInARClick}
                        >
                            {arStatus === 'session-started'
                                ? '👁️ In AR Mode'
                                : '🔮 View in AR'}
                        </button>
                    )}

                    {true && (
                        <button className='bg-black px-2 pb-1 rounded-lg text-2xl right-4 top-4 absolute text-[#f97613] font-semibold'>
                            t.
                        </button>
                    )}

                    {!isMobile && (
                        <div slot='poster' className='qr-section'>
                            <div className='qr-content'>
                                <div
                                    style={{
                                        fontSize: '64px',
                                        marginBottom: '16px',
                                    }}
                                >
                                    📱
                                </div>
                                <h2
                                    style={{
                                        fontSize: '24px',
                                        fontWeight: '700',
                                        marginBottom: '12px',
                                        color: '#1f2937',
                                    }}
                                >
                                    Scan to View in AR
                                </h2>
                                <p
                                    style={{
                                        fontSize: '14px',
                                        color: '#6b7280',
                                        marginBottom: '16px',
                                    }}
                                >
                                    Open your phone camera and scan the QR code
                                    that appears on this 3D viewer
                                </p>
                                <p
                                    style={{
                                        fontSize: '12px',
                                        color: '#9ca3af',
                                    }}
                                >
                                    The QR code is automatically generated by
                                    the model viewer
                                </p>
                            </div>
                        </div>
                    )}
                    {showMeasurements && dimensions && (
                        <>
                            <button
                                slot='hotspot-width'
                                className='measurement-annotation'
                                data-position='1 0 0'
                                data-normal='1 0 0'
                            >
                                W: {dimensions.width.toFixed(2)}m
                            </button>
                            <button
                                slot='hotspot-height'
                                className='measurement-annotation'
                                data-position='0 1 0'
                                data-normal='0 1 0'
                            >
                                H: {dimensions.height.toFixed(2)}m
                            </button>
                            <button
                                slot='hotspot-depth'
                                className='measurement-annotation'
                                data-position='0 0 1'
                                data-normal='0 0 1'
                            >
                                D: {dimensions.depth.toFixed(2)}m
                            </button>
                        </>
                    )}
                </model-viewer>
            </div>
            {showConfirmation && (
                <div className='modal-overlay'>
                    <div className='modal-content'>
                        <div
                            style={{
                                textAlign: 'center',
                                marginBottom: '24px',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '48px',
                                    marginBottom: '16px',
                                }}
                            >
                                🔮
                            </div>
                            <h3
                                style={{
                                    fontSize: '22px',
                                    fontWeight: '700',
                                    marginBottom: '12px',
                                    color: '#1f2937',
                                }}
                            >
                                Open AR Experience
                            </h3>
                            <p
                                style={{
                                    fontSize: '14px',
                                    color: '#6b7280',
                                    lineHeight: '1.6',
                                }}
                            >
                                You're about to enter augmented reality mode.
                                Make sure you're in a well-lit area with enough
                                space.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                className='button-secondary'
                                onClick={() => handleConfirmation(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className='button-primary'
                                onClick={() => handleConfirmation(true)}
                            >
                                Enter AR
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {captureStatus && (
                <div className='capture-status'>{captureStatus}</div>
            )}
        </div>
    );
}
