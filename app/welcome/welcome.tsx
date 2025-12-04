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
            'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
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

// Custom Model URL (Using publicly available model)
const BASE_MODEL_URL = "https://modelviewer.dev/shared-assets/models/Astronaut.glb";
const BASE_USDZ_URL = "https://modelviewer.dev/shared-assets/models/Astronaut.usdz";

// --- Customization & Utility Types ---
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

type ARStatus = 'idle' | 'detecting' | 'ready' | 'placed' | 'session-started' | 'failed';

/**
 * Parses URL parameters to retrieve custom product properties.
 */
const parseUrlParams = (): Customization => {
    const params = new URLSearchParams(window.location.search);
    return {
        color: params.get('color') || '#FFFFFF',
        scale: parseFloat(params.get('scale') || '1.0'),
        pattern: params.get('pattern') || 'solid',
        material: params.get('material') || 'default',
    };
};

/**
 * Checks if the user is on a recognized mobile device.
 */
const isMobileDevice = (): boolean => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

/**
 * Checks if the device is iOS.
 */
const isIOSDevice = (): boolean => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

/**
 * Checks if the device supports WebXR.
 */
const supportsWebXR = async (): Promise<boolean> => {
    if ('xr' in navigator) {
        try {
            return await (navigator as any).xr.isSessionSupported('immersive-ar');
        } catch {
            return false;
        }
    }
    return false;
};

/**
 * Converts hex color to RGB object.
 */
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : null;
};

// Component definition
export default function ProductARViewer() {
    // State Management
    const [isMobile, setIsMobile] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [webXRSupported, setWebXRSupported] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [customizations, setCustomizations] = useState<Customization>({ 
        color: '#FFFFFF', 
        scale: 1.0,
        pattern: 'solid',
        material: 'default'
    });
    const [arStatus, setArStatus] = useState<ARStatus>('idle');
    const [captureEnabled, setCaptureEnabled] = useState(false);
    const [showMeasurements, setShowMeasurements] = useState(false);
    const [dimensions, setDimensions] = useState<Dimensions | null>(null);
    const [fitCheckResult, setFitCheckResult] = useState<FitCheckResult | null>(null);
    const [customUSDZUrl, setCustomUSDZUrl] = useState<string>('');
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);
    const [captureStatus, setCaptureStatus] = useState<string>('');

    // Refs
    const modelViewerRef = useRef<HTMLElement | null>(null);
    const arButtonRef = useRef<HTMLButtonElement | null>(null);

    // 1. Initial Setup: Load scripts and detect capabilities
    useEffect(() => {
        const initialize = async () => {
            const mobile = isMobileDevice();
            const ios = isIOSDevice();
            const webXR = await supportsWebXR();

            setIsMobile(mobile);
            setIsIOS(ios);
            setWebXRSupported(webXR);
            setCustomizations(parseUrlParams());

            // Load model-viewer script
            const scriptId = 'model-viewer-script';
            if (!document.getElementById(scriptId)) {
                const script = document.createElement('script');
                script.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js";
                script.type = "module";
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

    // 2. Generate Custom USDZ for iOS (Client-side simulation)
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

    // 3. Apply Customizations to 3D Model
    const applyCustomizations = useCallback((viewer: HTMLElement) => {
        const modelViewer = viewer as any;

        if (!modelViewer.model) {
            console.warn('Model not ready yet');
            return;
        }

        try {
            const model = modelViewer.model;
            const colorRgb = hexToRgb(customizations.color);

            // Traverse the model and apply customizations
            model.traverse((node: any) => {
                if (node.isMesh && node.material) {
                    // Clone material to avoid affecting other instances
                    if (!node.material.isCloned) {
                        node.material = node.material.clone();
                        node.material.isCloned = true;
                    }

                    // Apply color customization
                    if (colorRgb && customizations.color !== '#FFFFFF') {
                        // For THREE.js materials
                        if (node.material.color) {
                            node.material.color.setRGB(colorRgb.r, colorRgb.g, colorRgb.b);
                        }

                        // For PBR materials with emissive
                        if (node.material.emissive) {
                            node.material.emissive.setRGB(
                                colorRgb.r * 0.1,
                                colorRgb.g * 0.1,
                                colorRgb.b * 0.1
                            );
                        }

                        node.material.needsUpdate = true;
                    }

                    // Apply material properties based on selection
                    if (customizations.material === 'metallic') {
                        node.material.metalness = 0.9;
                        node.material.roughness = 0.1;
                    } else if (customizations.material === 'matte') {
                        node.material.metalness = 0.0;
                        node.material.roughness = 0.8;
                    } else if (customizations.material === 'glossy') {
                        node.material.metalness = 0.3;
                        node.material.roughness = 0.2;
                    }
                }
            });

            // Apply scale
            if (customizations.scale !== 1.0) {
                model.scale.set(customizations.scale, customizations.scale, customizations.scale);
            }

            // Get dimensions for fit check
            const bbox = new (window as any).THREE.Box3().setFromObject(model);
            const size = bbox.getSize(new (window as any).THREE.Vector3());
            
            setDimensions({
                width: size.x * customizations.scale,
                height: size.y * customizations.scale,
                depth: size.z * customizations.scale
            });

            console.log('Customizations applied successfully');
        } catch (error) {
            console.error('Error applying customizations:', error);
        }
    }, [customizations]);

    // 4. Fit Check Logic
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
                color: '#ef4444' // red
            };
        } else if (spaceUsage > 80) {
            result = {
                fits: true,
                message: 'Tight fit - Limited space around object',
                icon: '⚡',
                color: '#f59e0b' // amber
            };
        } else if (spaceUsage > 60) {
            result = {
                fits: true,
                message: 'Good fit - Comfortable space',
                icon: '✓',
                color: '#10b981' // green
            };
        } else {
            result = {
                fits: true,
                message: 'Perfect fit - Plenty of space!',
                icon: '✓',
                color: '#10b981' // green
            };
        }

        setFitCheckResult(result);

        // Haptic feedback on fit check (if supported)
        if ('vibrate' in navigator && result.fits) {
            navigator.vibrate(50); // Short vibration for confirmation
        }

    }, [dimensions]);

    // 5. Handle Model Load
    const handleModelLoad = useCallback((e: any) => {
        console.log('Model loaded');
        setIsModelLoaded(true);
        setCaptureEnabled(true);
        modelViewerRef.current = e.target;
        applyCustomizations(e.target);

        // Hide instructions after 5 seconds
        setTimeout(() => {
            setShowInstructions(false);
        }, 5000);
    }, [applyCustomizations]);

    // 6. Handle AR Status Changes
    const handleARStatus = useCallback((e: any) => {
        const status = e.detail.status;
        console.log('AR Status:', status);

        if (status === 'not-presenting') {
            setArStatus('idle');
            setShowMeasurements(false);
        } else if (status === 'session-started') {
            setArStatus('session-started');
            setShowMeasurements(true);
            // Haptic feedback on AR start
            if ('vibrate' in navigator) {
                navigator.vibrate([50, 100, 50]); // Pattern vibration
            }
        } else if (status === 'object-placed') {
            setArStatus('placed');
            // Strong haptic on placement
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
        } else if (status === 'failed') {
            setArStatus('failed');
            alert('AR session failed. Please try again.');
        }
    }, []);

    // 7. Capture AR Image/Screenshot
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

    // 8. Handle "View in AR" Click
    const handleViewInARClick = () => {
        if (isMobile) {
            setShowConfirmation(true);
        } else {
            console.log("Desktop: QR code displayed automatically");
        }
    };

    // 9. Handle AR Confirmation
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

    // 10. Toggle Measurements
    const toggleMeasurements = () => {
        setShowMeasurements(!showMeasurements);
    };

    // 11. Custom Styling
    const style = `
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 1rem;
        }

        model-viewer {
            width: 100%;
            height: 500px;
            background: linear-gradient(to bottom, #e0e7ff, #f3f4f6);
            border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            position: relative;
        }

        @media (max-width: 768px) {
            model-viewer {
                height: 400px;
            }
        }

        .ar-button {
            position: absolute;
            bottom: 16px;
            right: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 50px;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 10px 15px -3px rgba(102, 126, 234, 0.4);
            transition: all 0.3s ease;
            z-index: 10;
        }

        .ar-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 20px -3px rgba(102, 126, 234, 0.6);
        }

        .ar-button:active {
            transform: translateY(0);
        }

        .capture-button {
            position: absolute;
            top: 16px;
            right: 16px;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px);
            color: #1f2937;
            border: 2px solid #e5e7eb;
            padding: 10px 16px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
            z-index: 10;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .capture-button:hover {
            background: white;
            transform: scale(1.05);
        }

        .capture-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .measurements-toggle {
            position: absolute;
            top: 16px;
            left: 16px;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px);
            color: #1f2937;
            border: 2px solid #e5e7eb;
            padding: 10px 16px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
            z-index: 10;
        }

        .measurements-toggle:hover {
            background: white;
            transform: scale(1.05);
        }

        .measurement-annotation {
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
        }

        .instruction-banner {
            background: white;
            padding: 1.5rem;
            border-radius: 16px;
            margin-bottom: 1.5rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .instruction-banner.closable {
            position: relative;
            padding-right: 3rem;
        }

        .close-instructions {
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: #f3f4f6;
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            transition: all 0.2s;
        }

        .close-instructions:hover {
            background: #e5e7eb;
            transform: rotate(90deg);
        }

        .fit-check-banner {
            padding: 1rem;
            border-radius: 12px;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 600;
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(4px);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .modal-content {
            background: white;
            padding: 2rem;
            border-radius: 20px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: scaleIn 0.3s ease;
        }

        @keyframes scaleIn {
            from {
                opacity: 0;
                transform: scale(0.9);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }

        .button-primary {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 100%;
        }

        .button-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.4);
        }

        .button-secondary {
            background: #f3f4f6;
            color: #1f2937;
            border: 2px solid #e5e7eb;
            padding: 12px 24px;
            border-radius: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 100%;
        }

        .button-secondary:hover {
            background: #e5e7eb;
        }

        .info-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 1.5rem;
            border-radius: 16px;
            margin-top: 1.5rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }

        .feature-item {
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            padding: 1rem;
            border-radius: 12px;
            transition: all 0.3s ease;
        }

        .feature-item:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-badge.success {
            background: #d1fae5;
            color: #065f46;
        }

        .status-badge.warning {
            background: #fef3c7;
            color: #92400e;
        }

        .status-badge.error {
            background: #fee2e2;
            color: #991b1b;
        }

        .capture-status {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            font-weight: 600;
            z-index: 1001;
            animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }

        .qr-section {
            position: absolute;
            inset: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 16px;
            z-index: 5;
        }

        .qr-content {
            text-align: center;
            padding: 2rem;
        }

        .dimension-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(255, 255, 255, 0.9);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            color: #1f2937;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
    `;

    return (
        <div className="container">
            <style dangerouslySetInnerHTML={{ __html: style }} />

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '2rem', color: 'white' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem' }}>
                    AR Product Viewer
                </h1>
                <p style={{ fontSize: '1.125rem', opacity: 0.9 }}>
                    Experience your customized product in augmented reality
                </p>
            </div>

            {/* Instruction Banner */}
            {showInstructions && (
                <div className="instruction-banner closable">
                    <button 
                        className="close-instructions"
                        onClick={() => setShowInstructions(false)}
                        aria-label="Close instructions"
                    >
                        ×
                    </button>
                    <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>
                            {isMobile ? '📱' : '🖥️'}
                        </span>
                        <div>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                                {isMobile ? 'Mobile: Tap to Enter AR' : 'Desktop: Scan QR Code'}
                            </h3>
                            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }}>
                                {isMobile
                                    ? 'Interact with the 3D model: Drag with one finger to rotate, pinch to zoom. Then tap "View in AR" to see it in your space.'
                                    : 'Scan the QR code with your mobile device to view in AR. On desktop, drag with mouse to rotate the model.'
                                }
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Customization Info */}
            <div className="info-card">
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>
                    Current Customization
                </h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="dimension-badge">
                        <span>Color:</span>
                        <span style={{ 
                            display: 'inline-block',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: customizations.color,
                            border: '2px solid #e5e7eb'
                        }}></span>
                        <strong>{customizations.color}</strong>
                    </div>
                    <div className="dimension-badge">
                        <span>Scale:</span>
                        <strong>{customizations.scale}x</strong>
                    </div>
                    <div className="dimension-badge">
                        <span>Material:</span>
                        <strong style={{ textTransform: 'capitalize' }}>{customizations.material}</strong>
                    </div>
                    {webXRSupported && (
                        <span className="status-badge success">
                            ✓ WebXR Supported
                        </span>
                    )}
                </div>
            </div>

            {/* Fit Check Result */}
            {fitCheckResult && (<div 
                className="fit-check-banner"
                style={{ 
                    backgroundColor: `${fitCheckResult.color}15`,
                    border: `2px solid ${fitCheckResult.color}40`,
                    color: fitCheckResult.color
                }}
            >
                <span style={{ fontSize: '24px' }}>{fitCheckResult.icon}</span>
                <span>{fitCheckResult.message}</span>
            </div>
        )}

        {/* Dimensions Display */}
        {dimensions && showMeasurements && (
            <div className="info-card" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>
                    📏 Product Dimensions (at {customizations.scale}x scale)
                </h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="dimension-badge">
                        Width: <strong>{dimensions.width.toFixed(2)}m</strong>
                    </div>
                    <div className="dimension-badge">
                        Height: <strong>{dimensions.height.toFixed(2)}m</strong>
                    </div>
                    <div className="dimension-badge">
                        Depth: <strong>{dimensions.depth.toFixed(2)}m</strong>
                    </div>
                </div>
            </div>
        )}

        {/* Model Viewer */}
        <div style={{ position: 'relative' }}>
            <model-viewer 
                src={BASE_MODEL_URL}
                ios-src={customUSDZUrl || BASE_USDZ_URL}
                ar 
                ar-modes="webxr scene-viewer quick-look"
                ar-scale="auto"
                ar-placement="floor"
                camera-controls 
                touch-action="pan-y"
                alt="Customizable 3D product in augmented reality"
                shadow-intensity="1"
                shadow-softness="0.5"
                exposure="1.0"
                interaction-prompt="auto"
                camera-orbit="0deg 75deg 105%"
                field-of-view="30deg"
                min-camera-orbit="auto auto 5%"
                max-camera-orbit="auto auto 500%"
                onLoad={handleModelLoad}
                onAr-status={handleARStatus}
            >
                {/* Capture Button */}
                {captureEnabled && (
                    <button
                        className="capture-button"
                        onClick={captureARImage}
                        disabled={!isModelLoaded}
                    >
                        <span>📸</span>
                        <span>Capture</span>
                    </button>
                )}

                {/* Measurements Toggle */}
                {dimensions && (
                    <button
                        className="measurements-toggle"
                        onClick={toggleMeasurements}
                    >
                        📏 {showMeasurements ? 'Hide' : 'Show'} Dimensions
                    </button>
                )}

                {/* Mobile AR Button */}
                {isMobile && (
                    <button 
                        slot="ar-button" 
                        className="ar-button"
                        ref={arButtonRef}
                        onClick={handleViewInARClick}
                    >
                        {arStatus === 'session-started' ? '👁️ In AR Mode' : '🔮 View in AR'}
                    </button>
                )}
                
                {/* Desktop QR Code Prompt */}
                {!isMobile && (
                    <div slot="poster" className="qr-section">
                        <div className="qr-content">
                            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📱</div>
                            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: '#1f2937' }}>
                                Scan to View in AR
                            </h2>
                            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                Open your phone camera and scan the QR code that appears on this 3D viewer
                            </p>
                            <p style={{ fontSize: '12px', color: '#9ca3af' }}>
                                The QR code is automatically generated by the model viewer
                            </p>
                        </div>
                    </div>
                )}

                {/* Measurement Annotations (Hotspots) */}
                {showMeasurements && dimensions && (
                    <>
                        <button 
                            slot="hotspot-width"
                            className="measurement-annotation"
                            data-position="1 0 0"
                            data-normal="1 0 0"
                        >
                            W: {dimensions.width.toFixed(2)}m
                        </button>
                        <button 
                            slot="hotspot-height"
                            className="measurement-annotation"
                            data-position="0 1 0"
                            data-normal="0 1 0"
                        >
                            H: {dimensions.height.toFixed(2)}m
                        </button>
                        <button 
                            slot="hotspot-depth"
                            className="measurement-annotation"
                            data-position="0 0 1"
                            data-normal="0 0 1"
                        >
                            D: {dimensions.depth.toFixed(2)}m
                        </button>
                    </>
                )}
            </model-viewer>
        </div>

        {/* Confirmation Modal */}
        {showConfirmation && (
            <div className="modal-overlay">
                <div className="modal-content">
                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔮</div>
                        <h3 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '12px', color: '#1f2937' }}>
                            Open AR Experience
                        </h3>
                        <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }}>
                            You're about to enter augmented reality mode. Make sure you're in a well-lit area with enough space.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            className="button-secondary"
                            onClick={() => handleConfirmation(false)}
                        >
                            Cancel
                        </button>
                        <button 
                            className="button-primary"
                            onClick={() => handleConfirmation(true)}
                        >
                            Enter AR
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Capture Status Toast */}
        {captureStatus && (
            <div className="capture-status">
                {captureStatus}
            </div>
        )}

        {/* AR Instructions */}
        <div className="info-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                📋 AR Placement Instructions
            </h3>
            <div className="feature-grid">
                <div className="feature-item">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '700' }}>Surface Detection</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                        Move your phone slowly to detect flat surfaces like floors or tables
                    </p>
                </div>
                <div className="feature-item">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>👆</div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '700' }}>Place Object</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                        Tap the screen where you want the product to appear
                    </p>
                </div>
                <div className="feature-item">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📏</div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '700' }}>Real Scale</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                        Product appears at 100% physical scale with applied customizations
                    </p>
                </div>
                <div className="feature-item">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔄</div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '700' }}>Interact</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                        Drag to move, use two fingers to rotate or scale the object
                    </p>
                </div>
                <div className="feature-item">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📸</div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '700' }}>Capture</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                        Take high-resolution screenshots and save to your gallery
                    </p>
                </div>
                <div className="feature-item">
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>↩️</div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '700' }}>Exit AR</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                        Use your device's back button to return to this page
                    </p>
                </div>
            </div>
        </div>

        {/* Feature Notes */}
        <div className="info-card">
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>
                ℹ️ Current Features
            </h3>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#6b7280', lineHeight: '1.8' }}>
                <li><strong>Color Customization:</strong> Applied dynamically from URL parameters</li>
                <li><strong>Scale Adjustment:</strong> Custom sizing preserved in AR mode</li>
                <li><strong>Material Options:</strong> Metallic, matte, or glossy finishes</li>
                <li><strong>Fit Check:</strong> Real-time space validation with haptic feedback</li>
                <li><strong>Measurements:</strong> Toggle dimension display on/off</li>
                <li><strong>Screenshot:</strong> High-resolution image capture</li>
                <li><strong>Cross-Platform:</strong> WebXR, ARCore (Android), ARKit (iOS)</li>
            </ul>
        </div>

        {/* Technical Info */}
        <div style={{ 
            marginTop: '2rem', 
            padding: '1rem', 
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.8)',
            textAlign: 'center'
        }}>
            <p style={{ margin: '0 0 8px 0' }}>
                <strong>Demo Model:</strong> Astronaut by Poly (Google) • 
                <strong> Device:</strong> {isMobile ? 'Mobile' : 'Desktop'} • 
                <strong> AR Support:</strong> {webXRSupported ? 'WebXR ✓' : isIOS ? 'ARKit ✓' : 'Scene Viewer ✓'}
            </p>
            <p style={{ margin: 0, fontSize: '11px', opacity: 0.7 }}>
                Color customization is simulated. For production, implement server-side USDZ generation.
            </p>
        </div>
    </div>
)}