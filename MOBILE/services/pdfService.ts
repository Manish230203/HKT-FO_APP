import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { Config } from '../constants/Config';
import { UDF_LOGO_BASE64, EAGLE_LOGO_BASE64 } from '../constants/companyLogos';

export interface CompletedReportData {
  id?: string;
  reportNo?: string;
  clientName?: string;
  siteName?: string;
  visitType?: string;
  date?: string;
  officer?: string;
  status?: string;
  rawReport?: any;
}

export const getCompanyInfo = (report: CompletedReportData) => {
  const raw = report.rawReport || {};
  const isEagleExplicit = raw.isEagle === true;
  const compName = String(raw.companyName || raw.company_name || raw.employee_company_name || '').toLowerCase();
  const compId = Number(raw.companyId || raw.company_id || raw.COMPANY || 1);
  const officerName = String(report.officer || raw.officer || '').toLowerCase();

  const isEagle =
    isEagleExplicit ||
    compId === 4 ||
    compName.includes('eagle') ||
    compName.includes('eispl') ||
    officerName.includes('anil bhosale') ||
    officerName.includes('bhosale');

  if (isEagle) {
    return {
      name: 'Eagle Industrial Services Pvt. Ltd.',
      logoBase64: EAGLE_LOGO_BASE64,
    };
  }
  return {
    name: 'Unique Delta Force Security Pvt. Ltd.',
    logoBase64: UDF_LOGO_BASE64,
  };
};

export const resolvePhotoAsBase64 = async (photoStr: string): Promise<string> => {
  if (!photoStr || typeof photoStr !== 'string') return '';
  const trimmed = photoStr.trim();
  if (!trimmed) return '';

  // 1. Already a Base64 data URL
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  const rawApi = Config.BASE_URL || process.env.EXPO_PUBLIC_API_URL || 'https://registry-amuser-bagging.ngrok-free.dev';
  const serverHost = rawApi.replace(/\/api\/?$/, '');

  // 2. Check for local device storage paths (file://, /data/, /var/, /storage/)
  const isLocalDevicePath =
    trimmed.startsWith('file://') ||
    trimmed.startsWith('/data/') ||
    trimmed.startsWith('/var/') ||
    trimmed.startsWith('/storage/');

  if (isLocalDevicePath) {
    try {
      const uriToRead = trimmed.startsWith('file://') ? trimmed : `file://${trimmed}`;
      const base64 = await FileSystem.readAsStringAsync(uriToRead, {
        encoding: 'base64',
      });
      if (base64 && base64.length > 20) {
        return `data:image/jpeg;base64,${base64}`;
      }
    } catch (e) {
      console.warn('Failed to read local device file as base64:', e);
    }
  }

  // 3. Resolve URL path to absolute endpoint
  let fullUrl = trimmed;
  if (fullUrl.includes('localhost') || fullUrl.includes('127.0.0.1')) {
    fullUrl = fullUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, serverHost);
  } else if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    const clean = fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}`;
    fullUrl = `${serverHost}${clean}`;
  }

  if (fullUrl.includes('ngrok-free.dev') && !fullUrl.includes('ngrok-skip-browser-warning')) {
    fullUrl += (fullUrl.includes('?') ? '&' : '?') + 'ngrok-skip-browser-warning=true';
  }

  // 4. Remote HTTP/HTTPS URL -> Download with ngrok headers and convert to base64
  try {
    const filename = `pdf_cache_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const targetFile = `${FileSystem.cacheDirectory}${filename}`;
    const downloadRes = await FileSystem.downloadAsync(fullUrl, targetFile, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'VigiloMobile/1.0',
      },
    });

    if (downloadRes.status === 200) {
      const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, {
        encoding: 'base64',
      });
      try {
        await FileSystem.deleteAsync(downloadRes.uri, { idempotent: true });
      } catch (delErr) {}

      if (base64Data && base64Data.length > 20) {
        return `data:image/jpeg;base64,${base64Data}`;
      }
    }
  } catch (err) {
    console.warn('FileSystem.downloadAsync failed, trying fetch fallback:', err);
  }

  // 5. Fetch fallback
  try {
    const response = await fetch(fullUrl, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'VigiloMobile/1.0',
      },
    });
    if (response.ok) {
      const blob = await response.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
            resolve(reader.result);
          } else {
            resolve(fullUrl);
          }
        };
        reader.onerror = () => resolve(fullUrl);
        reader.readAsDataURL(blob);
      });
    }
  } catch (fetchErr) {
    console.warn('Fetch fallback failed for image:', fullUrl, fetchErr);
  }

  return fullUrl;
};

export const generateAndShareVisitPdf = async (
  report: CompletedReportData,
  translations?: Record<string, string>
): Promise<{ success: boolean; uri?: string; message?: string }> => {
  try {
    const raw = report.rawReport || {};
    const company = getCompanyInfo(report);

    const reportId = report.reportNo || raw.report_id || raw.reportNo || raw.id || 'REPORT';
    const clientName = report.clientName || raw.client_name || raw.clientName || 'N/A';
    const siteName = report.siteName || raw.site_name || raw.siteName || 'N/A';
    const officerName = report.officer || raw.officer || raw.officer_name || 'Field Officer';
    const isTour =
      report.visitType === 'Patrolling Tour' ||
      report.visitType === 'Dynamic Tour' ||
      raw.visit_type === 'Dynamic Tour' ||
      String(reportId).startsWith('TOUR-');
    const isNewClient =
      !isTour &&
      (report.visitType === 'New Client Visit' ||
        raw.visit_type === 'Custom Visit' ||
        raw.visit_type === 'New Client Visit' ||
        Boolean(raw.custom_visit_id || raw.customVisitId || raw.is_custom || raw.isCustomVisit));
    const visitType = isTour
      ? 'Patrolling Tour'
      : isNewClient
      ? 'New Client Visit'
      : (report.visitType || 'Officer Visit');
    const dateStr = report.date || raw.visit_date || raw.created_on || new Date().toISOString().split('T')[0];

    const startTime = raw['check-in_time'] || raw.start_time || raw.startTime || raw.checkInTime || '—';
    const endTime = raw['check-out_time'] || raw.end_time || raw.endTime || raw.checkOutTime || '—';
    const shift = isTour ? 'Patrol Inspection' : (raw.shift || (visitType === 'Night Round' ? 'Night Shift' : 'Day Shift'));
    const gpsLocation = raw.gps || (raw.latitude && raw.longitude ? `${raw.latitude}, ${raw.longitude}` : 'Location Logged');

    // Parse Guards List
    let guardsList: any[] = [];
    const rawG = raw.guards;
    if (Array.isArray(rawG)) {
      guardsList = rawG;
    } else if (typeof rawG === 'string' && rawG.trim()) {
      try {
        guardsList = JSON.parse(rawG);
      } catch (e) {}
    }

    // Parse Checklist Items
    let checklistList: any[] = [];
    const rawC = raw.checklist;
    if (Array.isArray(rawC)) {
      checklistList = rawC;
    } else if (typeof rawC === 'string' && rawC.trim()) {
      try {
        checklistList = JSON.parse(rawC);
      } catch (e) {}
    }

    // Pre-process checklist photos to Base64 in parallel
    const processedChecklist = await Promise.all(
      checklistList.map(async (item: any) => {
        const itemPhotos: string[] = Array.from(
          new Set([
            item.photo,
            item.image,
            ...(Array.isArray(item.photos)
              ? item.photos
              : typeof item.photos === 'string' && item.photos
              ? [item.photos]
              : []),
          ])
        ).filter((p): p is string => Boolean(p && typeof p === 'string' && p.trim()));

        const base64Photos = await Promise.all(
          itemPhotos.map((p) => resolvePhotoAsBase64(p))
        );

        return {
          ...item,
          base64Photos,
        };
      })
    );

    // Filter to ONLY include present guards (do not show absent guards in PDF)
    const presentGuards = guardsList.filter((g) => {
      const statusRaw = String(g.status || '').trim().toLowerCase();
      const isAbsent =
        statusRaw.includes('absent') ||
        statusRaw === 'a' ||
        g.present === false ||
        g.isAbsent === true ||
        g.is_absent === true ||
        g.attendance === 'Absent';
      return !isAbsent;
    });

    // Guards Table HTML
    let guardsHtml = '';
    if (visitType !== 'General Audit' && !isTour && !isNewClient) {
      guardsHtml = `
        <div class="section-title">GUARDS PRESENT ON SITE (${presentGuards.length})</div>
      `;
      if (presentGuards.length > 0) {
        guardsHtml += `
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th>Guard Name</th>
                <th>Emp Code</th>
                <th style="text-align: right;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${presentGuards
                .map((g, idx) => {
                  return `
                  <tr>
                    <td style="color: #64748B;">${idx + 1}</td>
                    <td style="font-weight: 600; color: #0F172A;">${g.name || 'Security Guard'}</td>
                    <td style="color: #64748B;">${g.empCode || g.emp_code || g.employeeId || '—'}</td>
                    <td style="text-align: right;">
                      <span class="badge badge-success">
                        PRESENT
                      </span>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        `;
      } else {
        guardsHtml += `
          <div class="info-card" style="color: #64748B; font-style: italic;">
            No guards present on site for this visit.
          </div>
        `;
      }
    }

    // Checklist Items HTML
    let checklistHtml = '';
    if (visitType !== 'General Audit' && !isNewClient && processedChecklist.length > 0) {
      checklistHtml = `
        <div class="section-title">${isTour ? 'CHECKPOINT INSPECTION & OBSERVATIONS' : 'INSPECTION CHECKLIST & OBSERVATIONS'} (${processedChecklist.length})</div>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Checkpoint / Question</th>
              <th style="width: 130px; text-align: right;">Result</th>
            </tr>
          </thead>
          <tbody>
            ${processedChecklist
              .map((item, idx) => {
                const qText = item.question || item.title || String(item);
                const statusStr = item.status || item.answer || 'Satisfactory';
                const isNegative =
                  statusStr === 'Unsatisfactory' || statusStr === 'NO' || statusStr === 'NOT OK';
                const remarks = item.remarks || item.observation || '';

                const photosHtml =
                  item.base64Photos && item.base64Photos.length > 0
                    ? `
                  <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
                    ${item.base64Photos
                      .map((p: string) => `
                        <div style="border: 1px solid #CBD5E1; border-radius: 6px; overflow: hidden; display: inline-block;">
                          <img src="${p}" style="width: 80px; height: 80px; object-fit: cover; display: block;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width:80px;height:80px;background:#FEE2E2;color:#EF4444;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;\\'>Photo Unavailable</div>';" />
                        </div>
                      `)
                      .join('')}
                  </div>
                `
                    : '';

                return `
                <tr>
                  <td style="vertical-align: top; color: #64748B;">${idx + 1}</td>
                  <td>
                    <div style="font-weight: 600; color: #0F172A;">${qText}</div>
                    ${
                      remarks
                        ? `<div style="font-size: 11px; color: #475569; margin-top: 4px;"><strong>Remarks:</strong> ${remarks}</div>`
                        : ''
                    }
                    ${photosHtml}
                  </td>
                  <td style="text-align: right; vertical-align: top;">
                    <span class="badge ${!isNegative ? 'badge-success' : 'badge-danger'}">
                      ${statusStr}
                    </span>
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      `;
    }

    // General Visit specific section (Visit Parameters & Scope)
    let generalSectionHtml = '';
    if (visitType === 'General Audit' || visitType === 'New Client Visit') {
      const personVisited = raw.person_visited || raw.personVisited || 'N/A';
      const reasonOfVisit = raw.reason_of_visit || raw.reasonOfVisit || 'Routine Security Audit';
      const observations = raw.observations || raw.comments || raw.remarks || 'Audit completed satisfactorily.';
      generalSectionHtml = `
        <div class="section-title">VISIT PARAMETERS & SCOPE</div>
        <div class="info-card">
          <div style="margin-bottom: 10px;">
            <span class="field-label">Person Visited</span>
            <div class="field-value">${personVisited}</div>
          </div>
          <div style="margin-bottom: 10px;">
            <span class="field-label">Reason of Visit</span>
            <div class="field-value">${reasonOfVisit}</div>
          </div>
          <div>
            <span class="field-label">Officer Observations</span>
            <div class="field-value">${observations}</div>
          </div>
        </div>
      `;
    }

    // Night Visit specific section (Briefing, Lecture & Random Checking)
    let nightSectionHtml = '';
    if (visitType === 'Night Round') {
      const lecture = raw.lecture_details || raw.lectureDetails || 'No short lecture details recorded.';
      const randomCheck = raw.random_checking || raw.randomChecking || 'No random checking details recorded.';
      nightSectionHtml = `
        <div class="section-title">BRIEFING, LECTURE & RANDOM CHECKING</div>
        <div class="info-card">
          <div style="margin-bottom: 10px;">
            <span class="field-label">Short Lecture Details</span>
            <div class="field-value">${lecture}</div>
          </div>
          <div>
            <span class="field-label">Random Checking Details</span>
            <div class="field-value">${randomCheck}</div>
          </div>
        </div>
      `;
    }

    // Remarks & Officer Suggestions
    const overallRemarks =
      raw.overall_remarks || raw.suggestions || raw.key_improvements || raw.remark || '';

    // Collect all checklist question photos so they are NEVER shown under remarks/suggestions
    const checklistPhotoSet = new Set<string>();
    if (Array.isArray(checklistList)) {
      checklistList.forEach((item: any) => {
        if (item && item.photo && typeof item.photo === 'string') {
          checklistPhotoSet.add(item.photo.trim());
        }
        if (item && Array.isArray(item.photos)) {
          item.photos.forEach((p: any) => {
            if (p && typeof p === 'string') checklistPhotoSet.add(p.trim());
          });
        }
      });
    }

    let rawPhotosList: any[] = [];
    if (Array.isArray(raw.photos)) rawPhotosList = raw.photos;
    else if (typeof raw.photos === 'string' && raw.photos.trim()) {
      try { rawPhotosList = JSON.parse(raw.photos); } catch (e) { rawPhotosList = [raw.photos]; }
    }

    let rawAttachmentsList: any[] = [];
    if (Array.isArray(raw.attachments)) rawAttachmentsList = raw.attachments;
    else if (typeof raw.attachments === 'string' && raw.attachments.trim()) {
      try { rawAttachmentsList = JSON.parse(raw.attachments); } catch (e) { rawAttachmentsList = [raw.attachments]; }
    }

    let candidateRemarksPhotos: string[] = [];
    if (Array.isArray(raw.suggestion_photos) && raw.suggestion_photos.length > 0) {
      candidateRemarksPhotos = raw.suggestion_photos;
    } else if (Array.isArray(raw.suggestionPhotos) && raw.suggestionPhotos.length > 0) {
      candidateRemarksPhotos = raw.suggestionPhotos;
    } else if (rawAttachmentsList.length > 0) {
      candidateRemarksPhotos = rawAttachmentsList;
    } else {
      candidateRemarksPhotos = rawPhotosList;
    }

    const suggestionPhotosRaw: string[] = Array.from(
      new Set(candidateRemarksPhotos)
    )
      .filter((p): p is string => Boolean(p && typeof p === 'string' && p.trim()))
      .filter((p) => !checklistPhotoSet.has(p.trim()));

    const base64SuggestionPhotos = await Promise.all(
      suggestionPhotosRaw.map((p) => resolvePhotoAsBase64(p))
    );

    const sugPhotosHtml =
      base64SuggestionPhotos.length > 0
        ? `
      <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
        ${base64SuggestionPhotos
          .map((p) => `
            <div style="border: 1px solid #CBD5E1; border-radius: 6px; overflow: hidden; display: inline-block;">
              <img src="${p}" style="width: 80px; height: 80px; object-fit: cover; display: block;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width:80px;height:80px;background:#FEE2E2;color:#EF4444;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;\\'>Photo Unavailable</div>';" />
            </div>
          `)
          .join('')}
      </div>
    `
        : '';

    const cleanOverallRemarks = String(overallRemarks || '').trim();
    const remarksSectionHtml =
      cleanOverallRemarks || base64SuggestionPhotos.length > 0
        ? `
      <div class="section-title">REMARKS & OFFICER SUGGESTIONS</div>
      <div class="info-card">
        <div class="field-value">${cleanOverallRemarks || 'No remarks recorded.'}</div>
        ${sugPhotosHtml}
      </div>
    `
        : '';

    // Construct Complete Printable HTML Document matching in-app preview
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${reportId} - ${visitType}</title>
        <style>
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 30px;
            color: #0F172A;
            background-color: #FFFFFF;
            font-size: 13px;
            line-height: 1.5;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .header-container {
            border-bottom: 2px solid #00599B;
            padding-bottom: 14px;
            margin-bottom: 18px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .company-logo {
            height: 48px;
            max-width: 140px;
            object-fit: contain;
          }
          .company-text-group {
            display: flex;
            flex-direction: column;
          }
          .company-title {
            font-size: 17px;
            font-weight: 800;
            color: #00599B;
            letter-spacing: 0.3px;
            text-transform: uppercase;
          }
          .company-subtitle {
            font-size: 11px;
            color: #64748B;
            font-weight: 600;
            margin-top: 2px;
          }
          .header-right {
            text-align: right;
          }
          .confidential-badge {
            font-weight: 800;
            color: #00599B;
            font-size: 11px;
            letter-spacing: 0.5px;
          }
          .header-date {
            font-size: 12px;
            font-weight: 700;
            color: #0F172A;
            margin-top: 4px;
          }
          .header-date-val {
            color: #00599B;
            font-weight: 800;
          }
          .report-banner {
            background-color: #F8FAFC;
            border: 1.5px solid #CBD5E1;
            border-left: 6px solid #00599B;
            padding: 14px 18px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .report-title {
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.5px;
            color: #0F172A;
            text-transform: uppercase;
          }
          .report-id {
            font-size: 12px;
            font-weight: 700;
            color: #00599B;
            margin-top: 3px;
          }
          .banner-timing {
            text-align: right;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
          }
          .banner-date-badge {
            display: inline-block;
            background-color: #00599B;
            color: #FFFFFF;
            font-size: 12px;
            font-weight: 800;
            padding: 4px 10px;
            border-radius: 4px;
            letter-spacing: 0.5px;
            border: 1px solid #00477E;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .banner-time-text {
            font-size: 11px;
            font-weight: 700;
            color: #334155;
          }
          .section-title {
            font-size: 12px;
            font-weight: 800;
            color: #00599B;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            border-left: 3px solid #00599B;
            padding-left: 8px;
            margin-top: 22px;
            margin-bottom: 10px;
          }
          .info-card {
            background-color: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 14px 16px;
            margin-bottom: 16px;
          }
          .grid-2 {
            display: flex;
            flex-wrap: wrap;
            gap: 12px 24px;
          }
          .grid-item {
            flex: 1 1 45%;
          }
          .field-label {
            font-size: 11px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
            margin-bottom: 2px;
            display: block;
          }
          .field-value {
            font-size: 13px;
            font-weight: 600;
            color: #0F172A;
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 12px;
          }
          .report-table th {
            background-color: #F1F5F9;
            color: #334155;
            text-align: left;
            padding: 8px 12px;
            font-weight: 700;
            border-bottom: 1px solid #CBD5E1;
            font-size: 11px;
            text-transform: uppercase;
          }
          .report-table td {
            padding: 8px 12px;
            border-bottom: 1px solid #E2E8F0;
            vertical-align: middle;
          }
          .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .badge-success {
            background-color: #DCFCE7;
            color: #15803D;
            border: 1px solid #BBF7D0;
          }
          .badge-danger {
            background-color: #FEE2E2;
            color: #B91C1C;
            border: 1px solid #FECACA;
          }
          .footer-sign {
            margin-top: 36px;
            padding-top: 14px;
            border-top: 1px dashed #CBD5E1;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #64748B;
            page-break-inside: avoid;
          }
          .sign-block {
            text-align: center;
            width: 180px;
          }
          .sign-line {
            border-bottom: 1px solid #0F172A;
            height: 35px;
            margin-bottom: 6px;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="header-left">
            <img src="${company.logoBase64}" class="company-logo" alt="${company.name}" />
            <div class="company-text-group">
              <div class="company-title">${company.name}</div>
              <div class="company-subtitle">${isTour ? 'Field Officer Patrolling Tour Report' : isNewClient ? 'Field Officer New Client Visit Report' : 'Field Officer Operational Inspection Report'}</div>
            </div>
          </div>
          <div class="header-right">
            <div class="confidential-badge">CONFIDENTIAL</div>
            <div class="header-date">Date: <span class="header-date-val">${dateStr}</span></div>
          </div>
        </div>

        <div class="report-banner">
          <div>
            <div class="report-title">${visitType} REPORT</div>
            <div class="report-id">REPORT ID : ${reportId}</div>
          </div>
          <div class="banner-timing">
            <div class="banner-date-badge">DATE : ${dateStr}</div>
            <div class="banner-time-text">TIME : ${startTime} — ${endTime}</div>
          </div>
        </div>

        <div class="section-title">${isTour ? 'TOUR DETAILS & SCHEDULE' : isNewClient ? 'NEW CLIENT VISIT DETAILS' : 'VISIT INFORMATION'}</div>
        <div class="info-card">
          <div class="grid-2">
            <div class="grid-item">
              <span class="field-label">Report Date</span>
              <span class="field-value" style="color: #00599B; font-weight: 800;">${dateStr}</span>
            </div>
            ${!isTour ? `
            <div class="grid-item">
              <span class="field-label">Shift</span>
              <span class="field-value">${shift}</span>
            </div>` : ''}
            <div class="grid-item">
              <span class="field-label">Client Name</span>
              <span class="field-value">${clientName}</span>
            </div>
            <div class="grid-item">
              <span class="field-label">Site Name</span>
              <span class="field-value">${siteName}</span>
            </div>
            <div class="grid-item">
              <span class="field-label">Inspection Officer</span>
              <span class="field-value">${officerName}</span>
            </div>
            <div class="grid-item">
              <span class="field-label">Visit Timing</span>
              <span class="field-value">${startTime} — ${endTime}</span>
            </div>
            <div class="grid-item" style="flex: 1 1 100%;">
              <span class="field-label">Location Status</span>
              <span class="field-value">${gpsLocation}</span>
            </div>
          </div>
        </div>

        ${generalSectionHtml}

        ${guardsHtml}

        ${checklistHtml}

        ${nightSectionHtml}

        ${remarksSectionHtml}

        <div class="footer-sign">
          <div>
            Generated via Field Officer Reporting System<br/>
            Timestamp: ${new Date().toLocaleString()}
          </div>
          <div>
            Officer: <strong>${officerName}</strong>
          </div>
        </div>
      </body>
      </html>
    `;

    // Generate PDF File locally
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });

    if (!uri) {
      return { success: false, message: 'PDF file was not created by the native engine.' };
    }

    // Name the downloaded/shared PDF file exactly after the reportId
    const safeReportId = String(reportId || 'Report')
      .replace(/[\/\\:*?"<>|]/g, '-')
      .trim();
    const targetFilename = `${safeReportId}.pdf`;
    const namedPdfUri = `${FileSystem.cacheDirectory}${targetFilename}`;

    try {
      await FileSystem.copyAsync({
        from: uri,
        to: namedPdfUri,
      });
    } catch (copyErr) {
      console.warn('Could not copy PDF with custom name:', copyErr);
    }

    const shareUri = (await FileSystem.getInfoAsync(namedPdfUri)).exists ? namedPdfUri : uri;

    // Share / Open PDF with native intent
    const isShareAvailable = await Sharing.isAvailableAsync().catch(() => false);
    if (isShareAvailable) {
      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: `${safeReportId}`,
        UTI: 'com.adobe.pdf',
      });
      return { success: true, uri: shareUri };
    } else {
      if (Platform.OS === 'web') {
        window.open(shareUri, '_blank');
      }
      return { success: true, uri: shareUri, message: `PDF saved successfully as: ${targetFilename}` };
    }
  } catch (error: any) {
    console.error('generateAndShareVisitPdf error:', error);
    return {
      success: false,
      message: error?.message || 'Failed to generate PDF document.',
    };
  }
};
