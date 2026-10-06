import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';

export interface GenerateAndHandlePdfOptions {
  html: string;
  fileName: string;
  dialogTitle?: string;
  action?: 'download' | 'share';
}

export interface PdfResult {
  success: boolean;
  uri?: string;
  method?: 'saf' | 'sharing' | 'local';
  error?: string;
}

/**
 * Robustly generates a PDF from HTML, validates file accessibility,
 * and either saves it directly to a user-selected folder via Android StorageAccessFramework
 * or opens the native Sharing sheet.
 */
export async function generateAndHandlePdf(
  options: GenerateAndHandlePdfOptions
): Promise<PdfResult> {
  const { html, fileName, dialogTitle = 'Visit Report PDF', action = 'download' } = options;

  console.log('PDF generation started');

  // Step 1: Generate PDF using Print API
  const { uri: printUri } = await Print.printToFileAsync({ html });
  console.log('Raw generated PDF URI:', printUri);

  if (!printUri) {
    throw new Error('PDF generation failed: No URI returned from Print.printToFileAsync.');
  }

  // Sanitize file name
  const sanitizedBaseName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfFileName = `${sanitizedBaseName}.pdf`;

  // Step 2: Move/Copy to application accessible directory (documentDirectory)
  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error('No accessible local storage directory found on device.');
  }

  const targetUri = `${baseDir}${pdfFileName}`;

  // Clean up old file if present
  try {
    const existingInfo = await FileSystem.getInfoAsync(targetUri);
    if (existingInfo.exists) {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    }
  } catch (e) {
    console.warn('Error during existing file cleanup:', e);
  }

  // Copy printUri to targetUri in documentDirectory
  await FileSystem.copyAsync({
    from: printUri,
    to: targetUri,
  });

  // Clean up temporary printUri file
  try {
    if (printUri !== targetUri) {
      await FileSystem.deleteAsync(printUri, { idempotent: true });
    }
  } catch (e) {
    // Ignore cleanup error
  }

  // Step 3: Verify File Accessibility
  const fileInfo = await FileSystem.getInfoAsync(targetUri);
  console.log('PDF file validation:', fileInfo);

  if (!fileInfo.exists || (fileInfo.size ?? 0) === 0) {
    throw new Error('Generated PDF file is not accessible or is 0 bytes.');
  }

  console.log('Valid local PDF URI verified:', targetUri);

  // Step 4: Handle Download on Android via StorageAccessFramework (SAF)
  if (Platform.OS === 'android' && action === 'download' && FileSystem.StorageAccessFramework) {
    try {
      console.log('Requesting SAF directory permissions for Android PDF download...');
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      
      if (permissions.granted) {
        console.log('SAF directory granted, writing PDF file...');
        const base64Data = await FileSystem.readAsStringAsync(targetUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const createdFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          sanitizedBaseName,
          'application/pdf'
        );

        await FileSystem.StorageAccessFramework.writeAsStringAsync(
          createdFileUri,
          base64Data,
          { encoding: FileSystem.EncodingType.Base64 }
        );

        console.log('PDF operation completed via SAF: Saved to:', createdFileUri);
        Alert.alert('PDF Saved', 'Report PDF has been saved successfully to your chosen directory.');
        return { success: true, uri: createdFileUri, method: 'saf' };
      } else {
        console.log('SAF permission denied or cancelled by user. Falling back to Sharing sheet.');
      }
    } catch (safErr) {
      console.warn('SAF download failed or was cancelled, attempting fallback to Sharing:', safErr);
    }
  }

  // Step 5: Handle Sharing / iOS / Fallback
  const isSharingAvailable = await Sharing.isAvailableAsync();
  console.log('Sharing availability:', isSharingAvailable);

  if (isSharingAvailable) {
    console.log('PDF sharing started for target URI:', targetUri);
    await Sharing.shareAsync(targetUri, {
      mimeType: 'application/pdf',
      dialogTitle,
      UTI: 'com.adobe.pdf',
    });
    console.log('PDF operation completed via Sharing.');
    return { success: true, uri: targetUri, method: 'sharing' };
  } else {
    console.log('Sharing is unavailable on this device.');
    Alert.alert('PDF Ready', `Report PDF generated successfully.\nFile saved at: ${targetUri}`);
    return { success: true, uri: targetUri, method: 'local' };
  }
}
