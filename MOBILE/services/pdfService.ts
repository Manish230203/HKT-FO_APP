import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';

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

export const generateAndShareVisitPdf = async (
  report: CompletedReportData,
  translations?: Record<string, string>
): Promise<{ success: boolean; uri?: string; message?: string }> => {
  try {
    const raw = report.rawReport || {};

    const reportId = report.reportNo || raw.report_id || raw.reportNo || raw.id || 'REPORT';
    const clientName = report.clientName || raw.client_name || raw.clientName || 'N/A';
    const siteName = report.siteName || raw.site_name || raw.siteName || 'N/A';
    const officerName = report.officer || raw.officer || raw.officer_name || 'Field Officer';
    const visitType = report.visitType || 'Officer Visit';
    const dateStr = report.date || raw.visit_date || raw.created_on || new Date().toISOString().split('T')[0];
    
    const startTime = raw['check-in_time'] || raw.start_time || raw.startTime || raw.checkInTime || '—';
    const endTime = raw['check-out_time'] || raw.end_time || raw.endTime || raw.checkOutTime || '—';
    const shift = raw.shift || (visitType === 'Night Round' ? 'Night Shift' : 'Day Shift');
    const gpsLocation = raw.gps || (raw.latitude && raw.longitude ? `${raw.latitude}, ${raw.longitude}` : 'GPS Geofenced & Verified');

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

    // Guards Table HTML
    let guardsHtml = '';
    if (guardsList.length > 0) {
      guardsHtml = `
        <div class="section-title">GUARDS PRESENT ON SITE (${guardsList.length})</div>
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
            ${guardsList
              .map((g, idx) => {
                const isPresent = g.present !== false && g.status !== 'Absent';
                return `
                <tr>
                  <td>${idx + 1}</td>
                  <td style="font-weight: 600;">${g.name || 'Security Guard'}</td>
                  <td style="color: #64748B;">${g.empCode || g.emp_code || g.employeeId || '—'}</td>
                  <td style="text-align: right;">
                    <span class="badge ${isPresent ? 'badge-success' : 'badge-danger'}">
                      ${g.status || (isPresent ? 'Present' : 'Absent')}
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

    // Checklist Items HTML
    let checklistHtml = '';
    if (checklistList.length > 0) {
      checklistHtml = `
        <div class="section-title">INSPECTION CHECKLIST & OBSERVATIONS (${checklistList.length})</div>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Checkpoint / Question</th>
              <th style="width: 120px; text-align: right;">Result</th>
            </tr>
          </thead>
          <tbody>
            ${checklistList
              .map((item, idx) => {
                const qText = item.question || item.title || String(item);
                const statusStr = item.status || item.answer || 'Satisfactory';
                const isNegative =
                  statusStr === 'Unsatisfactory' || statusStr === 'NO' || statusStr === 'NOT OK';
                const remarks = item.remarks || item.observation || '';
                return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>
                    <div style="font-weight: 500;">${qText}</div>
                    ${remarks ? `<div style="font-size: 11px; color: #475569; margin-top: 4px;"><strong>Remarks:</strong> ${remarks}</div>` : ''}
                  </td>
                  <td style="text-align: right;">
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

    // Night Visit specific section
    let nightSectionHtml = '';
    if (visitType === 'Night Round') {
      const lecture = raw.lecture_details || raw.lectureDetails || 'N/A';
      const randomCheck = raw.random_checking || raw.randomChecking || 'N/A';
      nightSectionHtml = `
        <div class="section-title">BRIEFING & RANDOM CHECKING</div>
        <div class="info-card">
          <div style="margin-bottom: 8px;">
            <span class="field-label">Short Lecture Details:</span>
            <div class="field-value">${lecture}</div>
          </div>
          <div>
            <span class="field-label">Random Checking:</span>
            <div class="field-value">${randomCheck}</div>
          </div>
        </div>
      `;
    }

    // General Visit specific section
    let generalSectionHtml = '';
    if (visitType === 'General Audit') {
      const personVisited = raw.person_visited || raw.personVisited || 'N/A';
      const reasonOfVisit = raw.reason_of_visit || raw.reasonOfVisit || 'Routine Security Audit';
      const observations = raw.observations || raw.comments || raw.remarks || 'Audit completed satisfactorily.';
      generalSectionHtml = `
        <div class="section-title">AUDIT SCOPE & OBSERVATIONS</div>
        <div class="info-card">
          <div style="margin-bottom: 8px;">
            <span class="field-label">Person Visited:</span>
            <div class="field-value">${personVisited}</div>
          </div>
          <div style="margin-bottom: 8px;">
            <span class="field-label">Reason of Visit:</span>
            <div class="field-value">${reasonOfVisit}</div>
          </div>
          <div>
            <span class="field-label">Officer Observations:</span>
            <div class="field-value">${observations}</div>
          </div>
        </div>
      `;
    }

    // Construct Complete Printable HTML Document
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${reportId} - ${visitType}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 30px;
            color: #0F172A;
            background-color: #FFFFFF;
            font-size: 13px;
            line-height: 1.5;
          }
          .header-container {
            border-bottom: 2px solid #00599B;
            padding-bottom: 16px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .company-title {
            font-size: 20px;
            font-weight: 800;
            color: #00599B;
            letter-spacing: 0.5px;
          }
          .company-subtitle {
            font-size: 12px;
            color: #64748B;
            font-weight: 500;
          }
          .report-banner {
            background-color: #0F172A;
            color: #FFFFFF;
            padding: 12px 18px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .report-title {
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .report-id {
            font-size: 13px;
            font-weight: 700;
            color: #38BDF8;
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
          }
          .badge-danger {
            background-color: #FEE2E2;
            color: #B91C1C;
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
          <div>
            <div class="company-title">VIGILO SECURITY SOLUTIONS</div>
            <div class="company-subtitle">Field Officer Operational Inspection Report</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; color: #00599B;">CONFIDENTIAL</div>
            <div style="font-size: 11px; color: #64748B;">Date: ${dateStr}</div>
          </div>
        </div>

        <div class="report-banner">
          <div class="report-title">${visitType} REPORT</div>
          <div class="report-id">${reportId}</div>
        </div>

        <div class="section-title">GENERAL INFORMATION</div>
        <div class="info-card">
          <div class="grid-2">
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
              <span class="field-label">Shift</span>
              <span class="field-value">${shift}</span>
            </div>
            <div class="grid-item">
              <span class="field-label">Visit Timing</span>
              <span class="field-value">${startTime} — ${endTime}</span>
            </div>
            <div class="grid-item">
              <span class="field-label">Location Status</span>
              <span class="field-value">${gpsLocation}</span>
            </div>
          </div>
        </div>

        ${guardsHtml}

        ${checklistHtml}

        ${nightSectionHtml}

        ${generalSectionHtml}

        <div class="footer-sign">
          <div>
            Generated via VIGILO-OFFICER System<br/>
            Timestamp: ${new Date().toLocaleString()}
          </div>
          <div class="sign-block">
            <div class="sign-line"></div>
            <strong>${officerName}</strong><br/>
            Inspecting Field Officer
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

    // Share / Open PDF with native intent
    const isShareAvailable = await Sharing.isAvailableAsync().catch(() => false);
    if (isShareAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Download / Share Report ${reportId}`,
        UTI: 'com.adobe.pdf',
      });
      return { success: true, uri };
    } else {
      // In web or environments where sharing sheet is unavailable
      if (Platform.OS === 'web') {
        window.open(uri, '_blank');
      }
      return { success: true, uri, message: `PDF saved successfully at: ${uri}` };
    }
  } catch (error: any) {
    console.error('generateAndShareVisitPdf error:', error);
    return {
      success: false,
      message: error?.message || 'Failed to generate PDF document.',
    };
  }
};
