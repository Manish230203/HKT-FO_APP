import cv2
import numpy as np
import os
from app.config import FACE_MATCH_THRESHOLD

# Model paths
BASE_DIR = os.path.dirname(__file__)
DETECTOR_PATH = os.path.join(BASE_DIR, "face_detection_yunet.onnx")
RECOGNIZER_PATH = os.path.join(BASE_DIR, "face_recognition_sface.onnx")

# Global cache for models
_detector = None
_recognizer = None

def get_face_detector():
    global _detector
    if _detector is None:
        if not os.path.exists(DETECTOR_PATH):
            return None
        _detector = cv2.FaceDetectorYN.create(DETECTOR_PATH, "", (320, 320))
    return _detector

def get_face_recognizer():
    global _recognizer
    if _recognizer is None:
        if not os.path.exists(RECOGNIZER_PATH):
            return None
        _recognizer = cv2.FaceRecognizerSF.create(RECOGNIZER_PATH, "")
    return _recognizer

def detect_face(image_path):
    """
    Returns the number of faces detected in the image.
    Uses YuNet for robust detection.
    """
    img = cv2.imread(image_path)
    if img is None:
        return 0
    
    detector = get_face_detector()
    if detector is None:
        # Fallback to Haar Cascade if YuNet is not found
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        face_cascade = cv2.CascadeClassifier(cascade_path)
        faces = face_cascade.detectMultiScale(gray, 1.1, 5)
        return len(faces)

    height, width, _ = img.shape
    detector.setInputSize((width, height))
    _, faces = detector.detect(img)
    
    return len(faces) if faces is not None else 0

def get_face_embedding(image_path=None, img_data=None):
    """
    Extracts face embedding from an image file or bytes.
    Optimized: Resizes large images and supports in-memory data.
    """
    if img_data is not None:
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    elif image_path is not None:
        img = cv2.imread(image_path)
    else:
        return None

    if img is None:
        return None

    # Performance Optimization: Resize large images
    # SFace works well on smaller faces, 640px is a good balance for speed/accuracy
    h, w = img.shape[:2]
    max_size = 640
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    detector = get_face_detector()
    recognizer = get_face_recognizer()
    
    if detector is None or recognizer is None:
        return None

    detector.setInputSize((img.shape[1], img.shape[0]))
    _, faces = detector.detect(img)
    if faces is None:
        return None

    # Align and extract features
    face_align = recognizer.alignCrop(img, faces[0])
    face_feat = recognizer.feature(face_align)
    
    # Return as list for JSON storage
    return face_feat.flatten().tolist()

def match_embeddings(feat1_list, feat2_list, threshold=None):
    """
    Compares two embedding lists and returns True if they match.
    """
    if threshold is None:
        threshold = FACE_MATCH_THRESHOLD

    if not feat1_list or not feat2_list:
        return False, "Invalid embeddings"
        
    feat1 = np.array(feat1_list, dtype=np.float32).reshape(1, -1)
    feat2 = np.array(feat2_list, dtype=np.float32).reshape(1, -1)
    
    recognizer = get_face_recognizer()
    if recognizer is None:
        return False, "Recognizer not initialized"

    cosine_similarity = recognizer.match(feat1, feat2, cv2.FaceRecognizerSF_FR_COSINE)
    
    # Log similarity for audit/debugging
    print(f"DEBUG: Face matching similarity: {cosine_similarity:.4f} (Threshold: {threshold})")
    
    if cosine_similarity >= threshold:
        return True, "Faces match"
    else:
        return False, f"Face mismatch (Similarity: {cosine_similarity:.2f})"

def match_faces(image_path1, image_path2, threshold=None):
    """
    Compares two faces from files and returns True if they match.
    """
    if threshold is None:
        threshold = FACE_MATCH_THRESHOLD

    feat1 = get_face_embedding(image_path=image_path1)
    feat2 = get_face_embedding(image_path=image_path2)
    
    if feat1 is None:
        return False, "No face detected in original photo"
    if feat2 is None:
        return False, "No face detected in current photo"

    return match_embeddings(feat1, feat2, threshold)

def is_live_face(img_data=None, image_path=None):
    """
    Performs multiple anti-spoofing checks (Moire pattern detection via FFT,
    Laplacian variance for blur/re-capture detection, and color distribution analysis).
    Returns (bool, message)
    """
    if img_data is not None:
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    elif image_path is not None:
        img = cv2.imread(image_path)
    else:
        return False, "No image provided"
        
    if img is None:
        return False, "Failed to decode image"
        
    # Convert to Grayscale for texture and frequency analysis
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 1. Laplacian Variance (Texture validation)
    # Real photos have highly defined micro-textures (pores, individual hairs, eyes).
    # Re-captured photos or print-outs are smoother, screen grids smooth out fine gradients,
    # or camera auto-focus on a screen creates a slightly out-of-focus capture.
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    
    # 2. FFT Moire / Screen Pattern Detection
    # Capture of digital LCD/LED screens creates strong high-frequency banding (Moiré pattern).
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    magnitude_spectrum = np.abs(fshift)
    
    h, w = gray.shape
    cy, cx = h // 2, w // 2
    
    # Mask out the DC component and low frequencies at the center
    radius = int(min(h, w) * 0.15)
    y, x = np.ogrid[:h, :w]
    mask = (y - cy)**2 + (x - cx)**2 > radius**2
    
    high_freq = magnitude_spectrum * mask
    if np.sum(high_freq) > 0:
        max_peak = np.max(high_freq)
        mean_high = np.mean(high_freq)
        peak_ratio = max_peak / (mean_high + 1e-8)
    else:
        peak_ratio = 0
        
    # 3. HSV Color Saturation check
    # Screen glass reflection and LCD emissive colors show narrow bands/skewed saturation profiles.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    s_channel = hsv[:, :, 1]
    s_std = np.std(s_channel)
    
    # Log values for tuning/audit
    print(f"[ANTI-SPOOF] Laplacian Var: {laplacian_var:.2f}, Moire Peak Ratio: {peak_ratio:.2f}, Saturation Std: {s_std:.2f}")
    
    # Check 1: Blur / Smoothness check (lighting/focus)
    if laplacian_var < 75.0:
        return False, "Verification failed. Please stand in proper light and hold camera steady."
        
    # Check 2: Digital screen Moire check
    if peak_ratio > 65.0:
        return False, "Verification failed. Photos or screen videos are not allowed."
        
    # Check 3: Screen reflection/color compression check
    if s_std < 18.0 or s_std > 70.0:
        return False, "Verification failed. Look straight into the camera."
        
    return True, "Liveness check passed"
