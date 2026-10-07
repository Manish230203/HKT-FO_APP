import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Alert,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  CalendarDays,
  Building2,
  AlertCircle,
  RefreshCw,
  LogIn,
  LogOut,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getPlannedVisits,
  PlannedVisit,
  getActiveSiteVisitSession,
  checkInSiteVisit,
  checkOutSiteVisit,
  ActiveSiteSession,
} from '../../services/siteService';
import { getDayVisitReports, getNightVisitReports, getGeneralVisits, sendReportEmail } from '../../services/visitService';
import { getActiveCheckIns, saveActiveCheckIns, clearActiveCheckIn, ActiveCheckInInfo } from '../../services/db';
import { generateAndHandlePdf } from '../../services/pdfService';
import { THEME } from '../../constants/theme';
import * as Location from 'expo-location';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

import { Modal } from 'react-native';
import { X, User, MapPin, Building, FileText, Mail, Download, Clock as ClockIcon, ShieldAlert, LogOut as LogOutIcon, Navigation } from 'lucide-react-native';

type CompletedVisit = {
  id: string;
  reportNo: string;
  clientName: string;
  siteName: string;
  visitType: string;
  date: string;
  officer: string;
  status: string;
  siteId?: number | string;
  emailAccess?: number | boolean;
  companyName?: string;
  companyShortName?: string;
  companyId?: number;
  rawReport?: any;
};

// Haversine distance calculation in meters
function calculateHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function VisitsScreen() {
  const { user } = useAuth();
  const { todayRecord } = useAttendance();
  const { t } = useLanguage();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();

  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [loading, setLoading] = useState(false);
  const [plannedVisits, setPlannedVisits] = useState<PlannedVisit[]>([]);
  const [completedVisits, setCompletedVisits] = useState<CompletedVisit[]>([]);
  const [selectedReport, setSelectedReport] = useState<CompletedVisit | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const getReportCompany = (rep: CompletedVisit | null) => {
    if (!rep) {
      return {
        name: 'Unique Delta Force Security Pvt. Ltd.',
        logo: require('../../assets/images/udf_logo.png'),
        isEagle: false,
      };
    }
    const r = rep.rawReport || {};
    const compName = String(rep.companyName || r.companyName || r.company_name || r.employee_company_name || user?.company_name || '').toLowerCase();
    const compId = Number(rep.companyId || r.companyId || r.company_id || r.COMPANY || user?.company_id || 1);
    const officerName = String(rep.officer || r.officer || user?.name || '').toLowerCase();

    const isEagle = compId === 4 || compName.includes('eagle') || compName.includes('eispl') || officerName.includes('anil bhosale') || officerName.includes('bhosale');

    if (isEagle) {
      return {
        name: 'Eagle Industrial Services Pvt. Ltd.',
        logo: require('../../assets/images/eagle_logo.png'),
        isEagle: true,
      };
    }
    return {
      name: 'Unique Delta Force Security Pvt. Ltd.',
      logo: require('../../assets/images/udf_logo.png'),
      isEagle: false,
    };
  };

  const getLogoBase64 = async (isEagle: boolean) => {
    try {
      const module = isEagle
        ? require('../../assets/images/eagle_logo.png')
        : require('../../assets/images/udf_logo.png');
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      if (asset.localUri) {
        const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return `data:image/png;base64,${base64}`;
      }
    } catch (e) {
      console.warn('Failed to load logo base64:', e);
    }
    return '';
  };

  const resolveMobilePhotoUrl = (url: string) => {
    if (!url || typeof url !== 'string') return '';
    const cleanUrl = url.trim();
    if (!cleanUrl) return '';

    if (cleanUrl.startsWith('data:image/')) {
      return cleanUrl;
    }

    if (cleanUrl.length > 100 && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('file://') && !cleanUrl.startsWith('/')) {
      return `data:image/jpeg;base64,${cleanUrl}`;
    }

    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') || cleanUrl.startsWith('file://')) {
      return cleanUrl;
    }

    if (cleanUrl.startsWith('/uploads/') || cleanUrl.startsWith('uploads/')) {
      const relativePath = cleanUrl.startsWith('/') ? cleanUrl : `/${cleanUrl}`;
      const rawApi = process.env.EXPO_PUBLIC_API_URL || 'https://tarot-carrot-celery.ngrok-free.dev';
      const serverHost = rawApi.replace(/\/api\/?$/, '').replace(/\/+$/, '');
      return `${serverHost}${relativePath}`;
    }

    return cleanUrl;
  };

  const fetchImageAsBase64 = async (photoUrl: string): Promise<string> => {
    if (!photoUrl || typeof photoUrl !== 'string') return '';
    const cleanUrl = photoUrl.trim();
    if (!cleanUrl) return '';

    if (cleanUrl.startsWith('data:image/')) {
      return cleanUrl;
    }

    if (cleanUrl.length > 100 && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('file://') && !cleanUrl.startsWith('/')) {
      return `data:image/jpeg;base64,${cleanUrl}`;
    }

    const resolvedUrl = resolveMobilePhotoUrl(cleanUrl);
    if (!resolvedUrl) return '';

    // Handle local device file:// URIs (convert to base64 data URIs so WebViews in Android PDF printer can load them)
    if (resolvedUrl.startsWith('file://')) {
      try {
        const base64Data = await FileSystem.readAsStringAsync(resolvedUrl, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (base64Data) {
          return `data:image/jpeg;base64,${base64Data}`;
        }
      } catch (fsErr) {
        console.warn('Failed to read local file as base64:', fsErr);
      }
      return resolvedUrl;
    }

    // Handle remote http/https/uploads URLs
    try {
      const filename = `pdf_img_${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
      const targetPath = `${FileSystem.cacheDirectory}${filename}`;
      const downloadResult = await FileSystem.downloadAsync(resolvedUrl, targetPath, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });

      if (downloadResult.status === 200 && downloadResult.uri) {
        const base64Data = await FileSystem.readAsStringAsync(downloadResult.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        try {
          await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
        } catch (cleanErr) {}

        return `data:image/jpeg;base64,${base64Data}`;
      }
    } catch (e) {
      console.warn('fetchImageAsBase64 error for URL:', resolvedUrl, e);
    }

    return resolvedUrl;
  };

  const generateVisitReportHtml = async (report: any) => {
    const compInfo = getReportCompany(report);
    const companyName = compInfo.name || 'UNIQUE DELTA FORCE SECURITY PVT. LTD.';
    const logoBase64 = await getLogoBase64(compInfo.isEagle);

    const reportTitle = report?.visitType === 'Day Visit'
      ? 'OFFICER DAY VISIT REPORT'
      : report?.visitType === 'Night Round'
      ? 'OFFICER NIGHT VISIT REPORT'
      : 'OFFICER GENERAL VISIT REPORT';

    const raw = report?.rawReport || {};
    const dateStr = report?.date || '—';
    const startTimeStr = raw['check-in_time'] || raw.start_time || raw.startTime || '—';
    const endTimeStr = raw['check-out_time'] || raw.end_time || raw.endTime || '—';
    const clientName = report?.clientName || '—';
    const siteName = report?.siteName || '—';
    const shift = raw.shift || (report?.visitType === 'Night Round' ? 'Night Shift' : 'Day Shift');
    const officerName = report?.officer || user?.name || '—';
    const gpsLocation = raw.gps || 'Logged via FO Mobile App';
    const visitType = report?.visitType || 'General Audit';

    // 1. Visit Parameters & Scope (General Audit)
    let visitParametersHtml = '';
    if (visitType === 'General Audit') {
      const personVisited = raw.person_visited || raw.personVisited || 'N/A';
      const reasonOfVisit = raw.reason_of_visit || raw.reasonOfVisit || 'Routine Security Audit';
      visitParametersHtml = `
        <div style="margin-bottom: 18px;">
          <div class="navy-section-header">VISIT PARAMETERS & SCOPE</div>
          <table class="grid-table">
            <tr>
              <td class="label">Person Visited</td>
              <td class="val">${personVisited}</td>
              <td class="label">Reason of Visit</td>
              <td class="val">${reasonOfVisit}</td>
            </tr>
          </table>
        </div>
      `;
    }

    // 2. Guards Present on Duty
    let guardsHtml = '';
    if (visitType !== 'General Audit') {
      let guardsList: any[] = [];
      const rawG = raw.guards;
      if (Array.isArray(rawG)) guardsList = rawG;
      else if (typeof rawG === 'string' && rawG.trim()) {
        try { guardsList = JSON.parse(rawG); } catch (e) {}
      }

      if (guardsList.length > 0) {
        const rows = guardsList.map((g: any, idx: number) => {
          const isPresent = g.present !== false && g.status !== 'Absent';
          const statusText = g.status || (isPresent ? 'Present' : 'Absent');
          const badgeClass = isPresent ? 'badge-success' : 'badge-danger';
          return `
            <tr>
              <td style="width: 32px; text-align: center; color: #64748B;">${idx + 1}</td>
              <td style="font-weight: 700; color: #0F172A;">${g.name || 'Guard'}</td>
              <td style="color: #475569;">${g.empCode || g.employeeId || g.emp_code || 'G'}</td>
              <td style="width: 100px; text-align: center;">
                <span class="badge ${badgeClass}">${statusText}</span>
              </td>
            </tr>
          `;
        }).join('');

        guardsHtml = `
          <div style="margin-bottom: 18px;">
            <div class="navy-section-header">GUARDS PRESENT ON DUTY (${guardsList.length})</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 32px; text-align: center;">#</th>
                  <th style="text-align: left;">Guard Name</th>
                  <th style="text-align: left;">Emp Code</th>
                  <th style="text-align: center;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `;
      } else {
        guardsHtml = `
          <div style="margin-bottom: 18px;">
            <div class="navy-section-header">GUARDS PRESENT ON DUTY (0)</div>
            <div class="empty-box">No guards listed for this visit.</div>
          </div>
        `;
      }
    }

    // 3. Inspection Checklist Items
    let checklistHtml = '';
    if (visitType !== 'General Audit') {
      let checklistList: any[] = [];
      const rawC = raw.checklist;
      if (Array.isArray(rawC)) checklistList = rawC;
      else if (Array.isArray(raw.questions)) checklistList = raw.questions;
      else if (typeof rawC === 'string' && rawC.trim()) {
        try { checklistList = JSON.parse(rawC); } catch (e) {}
      } else if (rawC && typeof rawC === 'object') {
        checklistList = Object.keys(rawC).map((k) => ({ question: k, answer: rawC[k] }));
      }

      if (checklistList.length > 0) {
        const rowsArray = await Promise.all(checklistList.map(async (item: any, idx: number) => {
          const qText = item.question || item.title || item.name || String(item);
          const statusStr = item.status || item.answer || item.value || 'Satisfactory';
          const isNegative = statusStr === 'Unsatisfactory' || statusStr === 'NO' || statusStr === 'NOT OK' || String(statusStr).toLowerCase().includes('fail');
          const badgeClass = !isNegative ? 'badge-success' : 'badge-danger';
          const remarksText = item.remarks || item.observation ? `<div style="font-size: 11px; color: #64748B; margin-top: 3px;">Remarks: ${item.remarks || item.observation}</div>` : '';

          const itemPhoto = item.photo || (Array.isArray(item.photos) ? item.photos[0] : null);
          let photoHtml = '';
          if (itemPhoto) {
            const b64 = await fetchImageAsBase64(String(itemPhoto));
            if (b64) {
              photoHtml = `<div style="margin-top: 6px;"><img src="${b64}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 6px; border: 1px solid #CBD5E1;" /></div>`;
            }
          }

          return `
            <tr>
              <td style="width: 32px; text-align: center; color: #64748B; vertical-align: top; padding-top: 8px;">${idx + 1}</td>
              <td style="font-weight: 500; color: #0F172A; vertical-align: top; padding-top: 8px;">
                ${qText}
                ${remarksText}
                ${photoHtml}
              </td>
              <td style="width: 130px; text-align: center; vertical-align: top; padding-top: 8px;">
                <span class="badge ${badgeClass}">${statusStr}</span>
              </td>
            </tr>
          `;
        }));

        checklistHtml = `
          <div style="margin-bottom: 18px;">
            <div class="navy-section-header">INSPECTION CHECKLIST ITEMS (${checklistList.length})</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 32px; text-align: center;">#</th>
                  <th style="text-align: left;">Audit Parameter / Question</th>
                  <th style="text-align: center;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rowsArray.join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        checklistHtml = `
          <div style="margin-bottom: 18px;">
            <div class="navy-section-header">INSPECTION CHECKLIST ITEMS (0)</div>
            <div class="empty-box">No checklist items recorded.</div>
          </div>
        `;
      }
    }

    // 4. Briefing & Night Visit Details
    let nightDetailsHtml = '';
    if (visitType === 'Night Round') {
      const lecture = raw.lecture_details || raw.lectureDetails || 'No short lecture details recorded.';
      const randomChecking = raw.random_checking || raw.randomChecking || 'No random checking details recorded.';
      nightDetailsHtml = `
        <div style="margin-bottom: 18px;">
          <div class="navy-section-header">BRIEFING, LECTURE & RANDOM CHECKING</div>
          <table class="grid-table">
            <tr>
              <td class="label">Short Lecture Details</td>
              <td class="val">${lecture}</td>
            </tr>
            <tr>
              <td class="label">Random Checking Details</td>
              <td class="val">${randomChecking}</td>
            </tr>
          </table>
        </div>
      `;
    }

    // 5. Photo Evidence
    let photosHtml = '';
    const rawPhotos = raw.photos || raw.photo_evidence || raw.photo || [];
    const baseList = Array.isArray(rawPhotos)
      ? rawPhotos
      : (typeof rawPhotos === 'string' ? (JSON.parse(rawPhotos || '[]') || []) : []);

    const rawChecklist = raw.checklist;
    const parsedChecklist = Array.isArray(rawChecklist)
      ? rawChecklist
      : (typeof rawChecklist === 'string' ? (JSON.parse(rawChecklist || '[]') || []) : []);
    const checklistPhotos = (parsedChecklist || []).flatMap((c: any) => {
      if (!c) return [];
      if (c.photo) return [c.photo];
      if (Array.isArray(c.photos)) return c.photos;
      if (typeof c.photos === 'string') {
        try { return JSON.parse(c.photos); } catch (e) { return [c.photos]; }
      }
      return [];
    }).filter(Boolean);

    const rawObs = raw.observations;
    const parsedObs = Array.isArray(rawObs)
      ? rawObs
      : (typeof rawObs === 'string' ? (JSON.parse(rawObs || '[]') || []) : []);
    const obsPhotos = (parsedObs || []).flatMap((o: any) => {
      if (!o) return [];
      if (o.photo) return [o.photo];
      if (Array.isArray(o.photos)) return o.photos;
      if (typeof o.photos === 'string') {
        try { return JSON.parse(o.photos); } catch (e) { return [o.photos]; }
      }
      return [];
    }).filter(Boolean);

    const allPhotos = Array.from(new Set([...baseList, ...checklistPhotos, ...obsPhotos])).filter(
      (p) => p && typeof p === 'string' && String(p).trim() !== ''
    );

    if (allPhotos.length > 0) {
      const base64List = await Promise.all(allPhotos.map((p) => fetchImageAsBase64(String(p))));
      const imgElements = base64List.filter(Boolean).map((b64) => `<img src="${b64}" class="photo-img" />`).join('');

      if (imgElements) {
        photosHtml = `
          <div style="margin-bottom: 18px;">
            <div class="navy-section-header">PHOTO EVIDENCE (${allPhotos.length})</div>
            <div class="photo-grid">
              ${imgElements}
            </div>
          </div>
        `;
      }
    }

    // 6. Remarks & Suggestions
    const remarks = raw.overall_remarks || raw.suggestions || raw.remark || raw.remarks || 'No additional remarks recorded.';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${reportTitle}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; color: #1E293B; background: #FFFFFF; font-size: 12px; }
          .corporate-banner { border: 2px solid #1E3A8A; padding: 18px; border-radius: 12px; margin-bottom: 20px; background: #F8FAFC; }
          .header-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
          .logo-img { height: 38px; max-width: 140px; object-fit: contain; }
          .company-title { font-size: 18px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px; }
          .report-badge { background: #2563EB; color: #FFFFFF; font-weight: 800; font-size: 14px; padding: 6px 14px; border-radius: 6px; letter-spacing: 0.5px; display: inline-block; text-transform: uppercase; }
          .report-id { font-size: 11px; font-weight: 700; color: #2563EB; margin-top: 6px; letter-spacing: 0.5px; }
          .banner-date { font-size: 11px; font-weight: 600; color: #64748B; margin-top: 4px; }
          
          .navy-section-header { background: #0F172A; color: #FFFFFF; font-size: 12px; font-weight: 800; padding: 8px 12px; border-radius: 6px 6px 0 0; text-transform: uppercase; letter-spacing: 0.5px; }
          
          .grid-table { width: 100%; border-collapse: collapse; border: 1px solid #CBD5E1; font-size: 12px; border-radius: 0 0 6px 6px; overflow: hidden; }
          .grid-table td { padding: 8px 12px; border: 1px solid #CBD5E1; }
          .label { font-weight: 700; color: #475569; width: 25%; background: #F1F5F9; }
          .val { font-weight: 600; color: #0F172A; width: 25%; }
          
          .data-table { width: 100%; border-collapse: collapse; border: 1px solid #CBD5E1; font-size: 12px; border-radius: 0 0 6px 6px; overflow: hidden; }
          .data-table th { background: #E2E8F0; color: #0F172A; font-weight: 800; padding: 8px 12px; border: 1px solid #CBD5E1; }
          .data-table td { padding: 8px 12px; border: 1px solid #CBD5E1; }
          
          .badge { padding: 4px 10px; border-radius: 12px; font-weight: 800; font-size: 11px; display: inline-block; text-align: center; }
          .badge-success { background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC; }
          .badge-danger { background: #FEE2E2; color: #B91C1C; border: 1px solid #FCA5A5; }
          
          .remarks-box { border: 1px solid #CBD5E1; padding: 12px 14px; font-size: 12px; background: #F8FAFC; border-radius: 0 0 6px 6px; color: #0F172A; line-height: 1.5; }
          .empty-box { border: 1px solid #CBD5E1; padding: 12px; text-align: center; color: #64748B; font-style: italic; background: #F8FAFC; border-radius: 0 0 6px 6px; }
          
          .photo-grid { border: 1px solid #CBD5E1; padding: 12px; background: #F8FAFC; border-radius: 0 0 6px 6px; display: flex; flex-wrap: wrap; gap: 10px; }
          .photo-img { width: 130px; height: 130px; object-fit: cover; border-radius: 8px; border: 1px solid #CBD5E1; }
          
          .footer { text-align: center; margin-top: 36px; font-size: 10px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 12px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="corporate-banner">
          <div class="header-row">
            ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : ''}
            <div class="company-title">${companyName}</div>
          </div>
          <div>
            <div class="report-badge">${reportTitle}</div>
          </div>
          <div class="report-id">REPORT ID : ${report?.reportNo || 'N/A'}</div>
          <div class="banner-date">DATE : ${dateStr} | ${startTimeStr} - ${endTimeStr}</div>
        </div>

        <div style="margin-bottom: 18px;">
          <div class="navy-section-header">GENERAL INFORMATION</div>
          <table class="grid-table">
            <tr>
              <td class="label">Client Name</td>
              <td class="val">${clientName}</td>
              <td class="label">Site Name</td>
              <td class="val">${siteName}</td>
            </tr>
            <tr>
              <td class="label">Visit Date</td>
              <td class="val">${dateStr}</td>
              <td class="label">Shift</td>
              <td class="val">${shift}</td>
            </tr>
            <tr>
              <td class="label">Visit Type</td>
              <td class="val">${visitType}</td>
              <td class="label">Officer Name</td>
              <td class="val">${officerName}</td>
            </tr>
            <tr>
              <td class="label">Start Time</td>
              <td class="val">${startTimeStr}</td>
              <td class="label">End Time</td>
              <td class="val">${endTimeStr}</td>
            </tr>
            <tr>
              <td class="label">GPS Location</td>
              <td class="val" colspan="3">${gpsLocation}</td>
            </tr>
          </table>
        </div>

        ${visitParametersHtml}
        ${guardsHtml}
        ${checklistHtml}
        ${nightDetailsHtml}
        ${photosHtml}

        <div style="margin-bottom: 18px;">
          <div class="navy-section-header">REMARKS & OFFICER SUGGESTIONS</div>
          <div class="remarks-box">${remarks}</div>
        </div>

        <div class="footer">
          Generated electronically via FO Mobile App | © 2026 HUMANKIND TECHNOLOGY
        </div>
      </body>
      </html>
    `;
  };

  const handleDownloadPdf = async (report: any) => {
    if (!report) return;
    const reportId = report.id || report.reportNo || 'visit_report';
    try {
      setDownloadingPdfId(reportId);
      const htmlContent = await generateVisitReportHtml(report);
      const fileName = `Report_${String(report.reportNo || 'visit')}`;

      await generateAndHandlePdf({
        html: htmlContent,
        fileName,
        dialogTitle: `Share ${report.reportNo || 'Visit Report'} PDF`,
        action: 'download',
      });
    } catch (err: any) {
      console.error('PDF generation/download error:', err);
      Alert.alert('PDF Error', err.message || 'Failed to generate PDF report.');
    } finally {
      setDownloadingPdfId(null);
    }
  };

  // Active Checked-In Site Visits State (persisted in AsyncStorage / db.ts)
  const [activeCheckIns, setActiveCheckIns] = useState<Record<string, ActiveCheckInInfo>>({});
  
  // Backend Active Site Session State (SITE_VISIT_SESSIONS table)
  const [activeBackendSession, setActiveBackendSession] = useState<ActiveSiteSession | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [liveDurationMins, setLiveDurationMins] = useState<number>(0);

  // Dynamic Live Duration Timer for Active Site Visit Session
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (activeBackendSession && activeBackendSession.start_time) {
      const calcDuration = () => {
        const startMs = new Date(activeBackendSession.start_time).getTime();
        const nowMs = Date.now();
        const mins = Math.max(0, Math.floor((nowMs - startMs) / 60000));
        setLiveDurationMins(mins);
      };
      calcDuration();
      timer = setInterval(calcDuration, 5000);
    } else {
      setLiveDurationMins(0);
    }
    return () => clearInterval(timer);
  }, [activeBackendSession]);

  // Active Visit Check-out Enforcer Modal State
  const [enforcerModal, setEnforcerModal] = useState<{
    visible: boolean;
    pendingVisit?: PlannedVisit;
    activeSiteName?: string;
    activeStartTime?: string;
  }>({ visible: false });

  const getEmpOid = () => {
    if (!user) return 7558;
    return user.id || (user as any).oid || user.employee_id || 7558;
  };

  useFocusEffect(
    useCallback(() => {
      let locationSubscription: Location.LocationSubscription | null = null;
      let isSubscribed = true;

      loadStoredCheckIns();
      fetchActiveSession();
      fetchCurrentLocation();

      // Start real-time foreground location watching so distance updates dynamically
      (async () => {
        try {
          // 1. Instant cached location pickup (0ms)
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown && lastKnown.coords && isSubscribed) {
            setUserLocation(lastKnown.coords);
          }

          // 2. Active foreground GPS watcher
          locationSubscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 3000,
              distanceInterval: 2,
            },
            (loc) => {
              if (isSubscribed && loc && loc.coords) {
                setUserLocation(loc.coords);
              }
            }
          );
        } catch (err) {
          console.warn('Visits real-time location watcher warning:', err);
        }
      })();

      return () => {
        isSubscribed = false;
        if (locationSubscription) {
          locationSubscription.remove();
        }
      };
    }, [])
  );

  const fetchCurrentLocation = async () => {
    try {
      // 1. Instant check from last known cache
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && lastKnown.coords) {
        setUserLocation(lastKnown.coords);
      }
      // 2. Fresh balanced location fix
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (loc && loc.coords) {
        setUserLocation(loc.coords);
      }
    } catch (e) {
      console.warn('Could not fetch current location for geofence:', e);
    }
  };

  const fetchActiveSession = async () => {
    const empOid = getEmpOid();
    if (!empOid) return;
    try {
      const active = await getActiveSiteVisitSession(empOid);
      setActiveBackendSession(active);
    } catch (e) {
      console.warn('Error fetching active site session:', e);
    }
  };

  const loadStoredCheckIns = async () => {
    try {
      const stored = await getActiveCheckIns();
      if (stored) {
        setActiveCheckIns(stored);
      }
    } catch (e) {
      console.error('Failed to load active checkins', e);
    }
  };

  const handleCheckIn = async (pv: PlannedVisit) => {
    // 0. Enforce duty attendance punch-in requirement
    if (!todayRecord || !todayRecord.check_in || todayRecord.check_out) {
      Alert.alert(
        'Punch-In Required',
        'You must punch in for duty attendance before starting or checking into a site visit.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark Attendance', onPress: () => router.push('/(tabs)/attendance') }
        ]
      );
      return;
    }

    const empOid = getEmpOid();
    
    // 1. Check if officer has an active IN_PROGRESS session at a different site
    if (activeBackendSession && activeBackendSession.site_id !== Number(pv.siteId)) {
      setEnforcerModal({
        visible: true,
        pendingVisit: pv,
        activeSiteName: activeBackendSession.site_name,
        activeStartTime: activeBackendSession.start_time,
      });
      return;
    }

    const isCustomVisit = !!(pv.isCustomVisit || pv.is_custom || pv.clientId === 'OTHER' || pv.siteId === 0 || pv.siteId === '0' || !pv.siteId);

    // 2. Perform Geofence Validation (Compare Site Lat/Long vs Officer Lat/Long)
    if (!isCustomVisit && pv.latitude && pv.longitude) {
      let currentCoords = userLocation;
      if (!currentCoords) {
        try {
          const freshLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (freshLoc && freshLoc.coords) {
            currentCoords = freshLoc.coords;
            setUserLocation(freshLoc.coords);
          }
        } catch (locErr) {
          console.warn('Check-in location fix error:', locErr);
        }
      }

      if (!currentCoords) {
        Alert.alert(
          'Location Required',
          'Could not determine your GPS location. Please ensure location permissions and GPS are enabled.',
          [
            { text: 'Retry', onPress: fetchCurrentLocation },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        return;
      }

      const dist = calculateHaversineDistanceMeters(
        currentCoords.latitude,
        currentCoords.longitude,
        Number(pv.latitude),
        Number(pv.longitude)
      );

      const allowedRadius = pv.radius !== null && pv.radius !== undefined ? Number(pv.radius) : 100;

      // Geofence cutoff check
      if (dist > allowedRadius) {
        const distStr = dist >= 1000 ? `${parseFloat((dist / 1000).toFixed(1))}km` : `${Math.round(dist)} meters`;
        const radiusStr = allowedRadius >= 1000 ? `${parseFloat((allowedRadius / 1000).toFixed(1))}km` : `${allowedRadius} meters`;
        Alert.alert(
          'Geofence Warning: Outside Site Radius',
          `You are currently ${distStr} away from ${pv.siteName || 'Site'}.\n\nPlease move within ${radiusStr} of the site to check in.`,
          [
            { text: 'Refresh Location', onPress: fetchCurrentLocation },
            { text: 'OK', style: 'cancel' }
          ]
        );
        return;
      }
    }

    // 3. Trigger Backend Check-in in SITE_VISIT_SESSIONS
    try {
      const res = await checkInSiteVisit({
        employee_id: empOid,
        site_id: Number(pv.siteId || 1),
        site_name: pv.siteName,
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
      });

      if (res && res.success) {
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const todayStr = new Date().toISOString().split('T')[0];
        const newCheckIns = {
          ...activeCheckIns,
          [pv.id]: {
            checkInTime: nowTime,
            date: todayStr,
            siteId: pv.siteId,
            siteName: pv.siteName,
            clientId: pv.clientId,
          },
        };
        setActiveCheckIns(newCheckIns);
        await saveActiveCheckIns(newCheckIns);
        await fetchActiveSession();

        Alert.alert(
          t('checked_in_success_title') || 'Checked-In Successfully',
          `Check-In recorded at ${nowTime} for site:\n${pv.siteName || 'Site'}.\n\nYour site visit session is now active. Please submit the visit report to proceed to check-out.`
        );
      } else if (res && res.has_active_session) {
        setEnforcerModal({
          visible: true,
          pendingVisit: pv,
          activeSiteName: res.active_session?.site_name,
          activeStartTime: res.active_session?.start_time,
        });
      }
    } catch (err: any) {
      console.error('Check-in error:', err);
      Alert.alert('Check-In Error', err?.response?.data?.message || 'Failed to check in to site visit.');
    }
  };

  const handleForceCheckoutPreviousVisit = async () => {
    const empOid = getEmpOid();
    try {
      const res = await checkOutSiteVisit({
        employee_id: empOid,
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
      });

      if (res && res.success) {
        Alert.alert('Checked Out Previous Visit', res.message || 'Successfully checked out of previous visit.');
        setActiveBackendSession(null);
        const pendingToStart = enforcerModal.pendingVisit;
        setEnforcerModal({ visible: false });

        if (pendingToStart) {
          setTimeout(() => {
            handleCheckIn(pendingToStart);
          }, 400);
        }
      } else {
        Alert.alert('Check-Out Error', res?.message || 'Could not check out of previous visit.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to check out of previous visit.');
    }
  };

  const handleSubmitReportNav = (pv: PlannedVisit) => {
    const activeData = activeCheckIns[pv.id];
    const cIn = activeData?.checkInTime || (activeBackendSession && activeBackendSession.start_time ? new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '09:00');
    router.push(
      `/visits/select-type?clientId=${pv.clientId || ''}&siteId=${pv.siteId || ''}&plannedId=${pv.id}&checkInTime=${cIn}`
    );
  };

  const handleCheckOutVisit = async (pv: PlannedVisit) => {
    Alert.alert(
      t('confirm_checkout_title') || 'Confirm Check-Out',
      `Are you sure you want to check out from ${pv.siteName || 'this site'}?\n\nThis will complete and end your visit session.`,
      [
        {
          text: t('cancel') || 'Cancel',
          style: 'cancel',
        },
        {
          text: t('checkout') || 'Check-Out',
          style: 'destructive',
          onPress: async () => {
            const empOid = getEmpOid();
            try {
              await checkOutSiteVisit({
                employee_id: empOid,
                site_id: Number(pv.siteId),
                latitude: userLocation?.latitude,
                longitude: userLocation?.longitude,
              });
              await clearActiveCheckIn(pv.id);
              const updatedCheckIns = { ...activeCheckIns };
              delete updatedCheckIns[pv.id];
              setActiveCheckIns(updatedCheckIns);
              await fetchActiveSession();
              await fetchVisits();
              setActiveTab('completed');
              Alert.alert(t('visit_completed_title') || 'Visit Completed', t('visit_completed_desc') || 'You have checked out successfully! Visit record is complete.');
            } catch (e: any) {
              console.error('Check-out error:', e);
              Alert.alert('Check-Out Error', e?.response?.data?.message || 'Failed to complete check out.');
            }
          },
        },
      ]
    );
  };

  const isReportSubmittedForSite = (siteId?: number | string, siteName?: string) => {
    if (!siteId && !siteName) return false;
    // 1. Check local activeCheckIns state
    const matchingPv = siteId ? plannedVisits.find((pv) => Number(pv.siteId) === Number(siteId)) : undefined;
    const activeData = matchingPv ? activeCheckIns[String(matchingPv.id)] : Object.values(activeCheckIns).find((a: any) => Number(a?.siteId) === Number(siteId));
    if (activeData?.reportSubmitted) return true;

    // 2. Check if a report exists in completedVisits for this site THAT WAS CREATED DURING/AFTER THE CURRENT ACTIVE SESSION START
    if (!activeBackendSession || !activeBackendSession.start_time) return false;

    const sessionStartMs = new Date(activeBackendSession.start_time).getTime() - 2 * 60 * 1000; // 2 min margin for clock differences
    const sNameNorm = (siteName || '').toLowerCase().trim();

    const hasCompletedForThisSession = completedVisits.some((cv) => {
      const cvSiteId = cv.siteId || cv.rawReport?.site_id || cv.rawReport?.siteId;
      const cvSiteName = (cv.siteName || cv.rawReport?.site_name || '').toLowerCase().trim();

      const isSiteMatch = (siteId && cvSiteId && Number(cvSiteId) === Number(siteId)) ||
                          (sNameNorm && cvSiteName && (cvSiteName === sNameNorm || cvSiteName.includes(sNameNorm) || sNameNorm.includes(cvSiteName)));
      if (!isSiteMatch) return false;

      const createdTimeStr = cv.rawReport?.created_on || cv.rawReport?.createdOn || cv.date;
      if (!createdTimeStr) return false;

      const reportCreatedMs = new Date(createdTimeStr).getTime();
      return !isNaN(reportCreatedMs) && reportCreatedMs >= sessionStartMs;
    });

    return hasCompletedForThisSession;
  };

  const handleTopCheckOut = async () => {
    if (!activeBackendSession) return;

    // Search for a matching planned visit for this site
    const matchingPv = plannedVisits.find((pv) => Number(pv.siteId) === Number(activeBackendSession.site_id));
    const isSubmitted = isReportSubmittedForSite(activeBackendSession.site_id, activeBackendSession.site_name);

    if (isSubmitted) {
      if (matchingPv) {
        await handleCheckOutVisit(matchingPv);
      } else {
        Alert.alert(
          t('confirm_checkout_title') || 'Confirm Check-Out',
          `Are you sure you want to check out from ${activeBackendSession.site_name || 'this site'}?\n\nThis will complete and end your visit session.`,
          [
            {
              text: t('cancel') || 'Cancel',
              style: 'cancel',
            },
            {
              text: t('checkout') || 'Check-Out',
              style: 'destructive',
              onPress: async () => {
                try {
                  const empOid = getEmpOid();
                  await checkOutSiteVisit({
                    employee_id: empOid,
                    site_id: Number(activeBackendSession.site_id),
                    latitude: userLocation?.latitude,
                    longitude: userLocation?.longitude,
                  });
                  if (activeBackendSession.site_id) {
                    await clearActiveCheckIn(activeBackendSession.site_id);
                  }
                  await fetchActiveSession();
                  await fetchVisits();
                  setActiveTab('completed');
                  Alert.alert(t('visit_completed_title') || 'Visit Completed', t('visit_completed_desc') || 'You have checked out successfully! Visit record is complete.');
                } catch (e: any) {
                  console.error('Check-out error:', e);
                  Alert.alert('Check-Out Error', e?.response?.data?.message || 'Failed to complete check out.');
                }
              },
            },
          ]
        );
      }
    } else {
      const cIn = activeBackendSession.start_time ? new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '09:00';
      router.push(
        `/visits/select-type?clientId=${matchingPv?.clientId || ''}&siteId=${activeBackendSession.site_id || ''}&plannedId=${matchingPv?.id || ''}&checkInTime=${cIn}`
      );
    }
  };

  // Email Form State (Single Modal)
  const [isEmailFormOpen, setIsEmailFormOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const isEmailAllowed = (report: CompletedVisit | null) => {
    if (!report) return false;
    const r = report.rawReport || {};
    const access = r.emailAccess !== undefined ? r.emailAccess : (r.email_access !== undefined ? r.email_access : (report.emailAccess !== undefined ? report.emailAccess : 1));
    return access === 1 || access === '1' || access === true;
  };

  const handleOpenEmailForm = (report: CompletedVisit | null) => {
    if (!report) return;
    if (!isEmailAllowed(report)) {
      Alert.alert(
        'Email Access Disabled',
        'Email sending is disabled for this branch in branch settings. Please contact your administrator.'
      );
      return;
    }
    setSelectedReport(report);
    setRecipientEmail('');
    setEmailSubject(`Officer Report - ${report.reportNo}`);
    setEmailMessage(
      `Dear Sir/Madam,\n\nPlease find the details for Officer ${report.visitType} Report (${report.reportNo}) for ${report.siteName} (${report.clientName}).\n\nThank you.`
    );
    setIsEmailFormOpen(true);
  };

  const handleSendEmail = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid recipient email address.');
      return;
    }

    setEmailSending(true);
    try {
      const targetReport = selectedReport;
      const branchIdVal = targetReport?.rawReport?.branchId || targetReport?.rawReport?.branch_id || targetReport?.rawReport?.BRANCH;
      const siteIdVal = targetReport?.rawReport?.site_id || targetReport?.rawReport?.siteId || targetReport?.rawReport?.SITE || targetReport?.siteId;

      const res = await sendReportEmail({
        email: recipientEmail.trim(),
        subject: emailSubject,
        message: emailMessage,
        branchId: branchIdVal,
        siteId: siteIdVal,
      });

      if (res && res.success) {
        Alert.alert('Email Sent', res.message || `Report email sent successfully to ${recipientEmail}!`);
        setIsEmailFormOpen(false);
      } else {
        Alert.alert('Failed to Send', res?.message || 'Failed to send report email.');
      }
    } catch (err: any) {
      console.error('Send email error:', err);
      const detail = err?.response?.data?.detail || err?.message || '';
      const status = err?.response?.status;
      if (status === 403 || detail.toLowerCase().includes('disabled') || detail.toLowerCase().includes('access') || detail.toLowerCase().includes('email_access')) {
        Alert.alert(
          'Access Denied',
          'You do not have access to send email reports for this branch/site. Email sending is disabled in branch settings.'
        );
      } else {
        Alert.alert('Error', detail || 'Failed to send email report. Please check recipient email and network.');
      }
    } finally {
      setEmailSending(false);
    }
  };

  // Sync tab from navigation params each time they change
  useEffect(() => {
    if (params.tab === 'completed') {
      setActiveTab('completed');
    } else {
      setActiveTab('pending');
    }
  }, [params.tab]);

  const fetchVisits = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const empOidVal = user?.id || user?.empOid || user?.employee_id || 7558;

      const planned = await getPlannedVisits(empOidVal);
      setPlannedVisits(planned || []);

      const compiled: CompletedVisit[] = [];
      const seenIds = new Set<string>();

      const dayReps = await getDayVisitReports(empOidVal);
      (dayReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('day_') ? rawOid : `day_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.reportNo || r.report_id || `DVR-${rawOid}`,
            clientName: r.client_name || r.clientName || r.company || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.unit || 'ADIENT - PIMPRI',
            visitType: 'Day Visit',
            date: r.visitDate || r.visit_date || r.createdOn || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            emailAccess: r.emailAccess !== undefined ? r.emailAccess : (r.email_access !== undefined ? r.email_access : 1),
            companyName: r.companyName || r.company_name || user?.company_name || 'Unique Delta Force Security Pvt. Ltd.',
            companyShortName: r.companyShortName || r.company_short_name || 'UDF',
            companyId: r.companyId || r.company_id || user?.company_id || 1,
            rawReport: r,
          });
        }
      });

      const nightReps = await getNightVisitReports(empOidVal);
      (nightReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('night_') ? rawOid : `night_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.reportNo || r.report_id || `NVR-${rawOid}`,
            clientName: r.client_name || r.clientName || r.company || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.unit || 'ADIENT - PIMPRI',
            visitType: 'Night Round',
            date: r.visitDate || r.visit_date || r.createdOn || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            emailAccess: r.emailAccess !== undefined ? r.emailAccess : (r.email_access !== undefined ? r.email_access : 1),
            companyName: r.companyName || r.company_name || user?.company_name || 'Unique Delta Force Security Pvt. Ltd.',
            companyShortName: r.companyShortName || r.company_short_name || 'UDF',
            companyId: r.companyId || r.company_id || user?.company_id || 1,
            rawReport: r,
          });
        }
      });

      const genReps = await getGeneralVisits(empOidVal);
      (genReps || []).forEach((r: any, idx: number) => {
        const rawOid = String(r.id || r.oid || idx);
        const itemKey = rawOid.startsWith('gen_') ? rawOid : `gen_${rawOid}`;
        if (!seenIds.has(itemKey)) {
          seenIds.add(itemKey);
          compiled.push({
            id: itemKey,
            reportNo: r.report_id || r.report_no || r.reportNo || `GVR-${rawOid}`,
            clientName: r.client_name || r.clientName || 'ADIENT INDIA PVT LTD',
            siteName: r.site_name || r.siteName || 'ADIENT - PIMPRI',
            visitType: 'General Audit',
            date: r.visit_date || r.visitDate || today,
            officer: r.officer || user?.name || 'Amit Kulkarni',
            status: 'Completed',
            emailAccess: r.emailAccess !== undefined ? r.emailAccess : (r.email_access !== undefined ? r.email_access : 1),
            companyName: r.companyName || r.company_name || user?.company_name || 'Unique Delta Force Security Pvt. Ltd.',
            companyShortName: r.companyShortName || r.company_short_name || 'UDF',
            rawReport: r,
          });
        }
      });

      compiled.sort((a: any, b: any) => {
        const getTimestamp = (item: any) => {
          const r = item.rawReport || {};
          const created = r.created_on || r.createdOn || item.date;
          const checkOut = r.check_out_time || r.checkOutTime || r['check-out_time'];
          const checkIn = r.check_in_time || r.checkInTime || r['check-in_time'];

          let timeMs = 0;
          if (created) {
            const normCreated = typeof created === 'string' ? created.replace(' ', 'T') : created;
            const dt = new Date(normCreated);
            if (!isNaN(dt.getTime())) timeMs = dt.getTime();
          }

          if (timeMs === 0) {
            const datePart = (item.date || (typeof created === 'string' ? created : '') || '').slice(0, 10);
            const timePart = checkOut || checkIn || '00:00';
            const combined = new Date(`${datePart}T${timePart}:00`);
            if (!isNaN(combined.getTime())) timeMs = combined.getTime();
          }

          return timeMs;
        };

        const tA = getTimestamp(a);
        const tB = getTimestamp(b);
        if (tA !== tB) return tB - tA;

        const oidA = parseInt(String(a.rawReport?.oid || a.id || '0').replace(/\D/g, ''), 10) || 0;
        const oidB = parseInt(String(b.rawReport?.oid || b.id || '0').replace(/\D/g, ''), 10) || 0;
        return oidB - oidA;
      });

      setCompletedVisits(compiled);
    } catch (e) {
      console.error('Failed to fetch visits', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchVisits();
    }, [])
  );

  const isVisitOverdue = (pv: PlannedVisit) => {
    if (pv.status === 'Completed') return false;
    if (pv.status === 'Overdue') return true;
    const periodStr = pv.plannedPeriod || pv.date || '';
    if (periodStr) {
      const parts = periodStr.split('-');
      const endDateStr = parts[parts.length - 1].trim();
      const endDate = new Date(endDateStr);
      if (!isNaN(endDate.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (endDate < today) return true;
      }
    }
    return false;
  };

  const pendingVisits = plannedVisits.filter((pv) => {
    if (pv.status === 'Completed') return false;
    const done = pv.completedVisits || 0;
    const freq = pv.visitFrequency
      ? parseInt(String(pv.visitFrequency), 10)
      : pv.frequency
      ? parseInt(String(pv.frequency), 10)
      : 1;
    return done < freq || freq === 0;
  });

  const getStatusInfo = (pv: PlannedVisit) => {
    const overdue = isVisitOverdue(pv);
    const done = pv.completedVisits || 0;
    const total =
      (pv.visitFrequency
        ? parseInt(String(pv.visitFrequency), 10)
        : pv.frequency
        ? parseInt(String(pv.frequency), 10)
        : 1) || 1;

    if (overdue) return { label: t('overdue'), color: '#EF4444', bg: 'rgba(239,68,68,0.15)', done, total };
    if (done > 0) return { label: t('in_progress'), color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', done, total };
    return { label: t('pending'), color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', done, total };
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <View style={styles.headerTextCol}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {activeTab === 'pending' ? t('pending_visits') : t('completed_visits')}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textVariant }]}>
            {activeTab === 'pending'
              ? `${pendingVisits.length} ${t('pending')}`
              : `${completedVisits.length} ${t('completed')}`}
          </Text>
        </View>
        <TouchableOpacity onPress={fetchVisits} style={styles.refreshBtn}>
          <RefreshCw color={colors.primary} size={20} />
        </TouchableOpacity>
      </View>


      {/* ACTIVE SITE VISIT SESSION BANNER */}
      {activeBackendSession && (() => {
        const isTopReportSubmitted = isReportSubmittedForSite(activeBackendSession.site_id, activeBackendSession.site_name);

        return (
          <View style={[styles.activeSessionBanner, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF', borderColor: colors.primary }, isTopReportSubmitted ? { borderColor: '#A855F7' } : {}]}>
            <View style={styles.activeSessionTextCol}>
              <View style={styles.activeSessionPulseRow}>
                <View style={[styles.pulseDot, { backgroundColor: isTopReportSubmitted ? '#A855F7' : '#10B981' }]} />
                <Text style={[styles.activeSessionTitle, { color: isTopReportSubmitted ? '#C084FC' : colors.primary }]}>
                  {isTopReportSubmitted ? 'REPORT SUBMITTED' : 'ACTIVE SITE VISIT SESSION'}
                </Text>
              </View>
              <Text style={[styles.activeSessionSiteName, { color: colors.text }]}>{activeBackendSession.site_name}</Text>
              <Text style={[styles.activeSessionSubText, { color: colors.textVariant }]}>
                Started at {new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {isTopReportSubmitted ? 'Ready for Check-Out' : 'Report Pending'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.activeSessionCheckoutBtn, { backgroundColor: isTopReportSubmitted ? '#EF4444' : '#3B82F6' }]}
              onPress={handleTopCheckOut}
            >
              {isTopReportSubmitted ? (
                <>
                  <LogOutIcon color="#FFFFFF" size={15} style={{ marginRight: 5 }} />
                  <Text style={styles.activeSessionCheckoutBtnText}>Check-Out</Text>
                </>
              ) : (
                <>
                  <FileText color="#FFFFFF" size={15} style={{ marginRight: 5 }} />
                  <Text style={styles.activeSessionCheckoutBtnText}>Submit Report</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        );
      })()}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchVisits} tintColor={colors.primary} />}
      >
        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <>
            {pendingVisits.length === 0 ? (
              <View style={styles.emptyBox}>
                <CheckCircle2 color="#10B981" size={48} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('all_clear')}</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textVariant }]}>{t('no_pending_visits_desc')}</Text>
              </View>
            ) : (
              pendingVisits.map((pv) => {
                const status = getStatusInfo(pv);
                
                const isCustomVisit = !!(pv.isCustomVisit || pv.is_custom || pv.clientId === 'OTHER' || pv.siteId === 0 || pv.siteId === '0' || !pv.siteId);
                
                const hasSiteCoords = !isCustomVisit && pv.latitude !== null && pv.latitude !== undefined && Number(pv.latitude) !== 0 &&
                                       pv.longitude !== null && pv.longitude !== undefined && Number(pv.longitude) !== 0;

                let isOutsideGeofence = false;
                let distanceMeters: number | null = null;

                if (!isCustomVisit && hasSiteCoords && userLocation) {
                  distanceMeters = Math.round(calculateHaversineDistanceMeters(
                    userLocation.latitude,
                    userLocation.longitude,
                    Number(pv.latitude),
                    Number(pv.longitude)
                  ));
                  const allowedRadius = pv.radius !== null && pv.radius !== undefined ? Number(pv.radius) : 100;
                  isOutsideGeofence = distanceMeters > allowedRadius;
                } else if (!hasSiteCoords && !isCustomVisit) {
                  isOutsideGeofence = true;
                }

                // Check if this planned visit site matches the active backend session or local checkin
                const isReportSubmitted = isReportSubmittedForSite(pv.siteId, pv.siteName);
                const activeData = activeCheckIns[String(pv.id)] || (activeBackendSession && Number(activeBackendSession.site_id) === Number(pv.siteId) ? { checkInTime: activeBackendSession.start_time ? new Date(activeBackendSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '09:00', date: '', siteId: pv.siteId, reportSubmitted: isReportSubmitted } : null);
                const isCheckedIn = !!activeData || (activeBackendSession && Number(activeBackendSession.site_id) === Number(pv.siteId));

                return (
                  <View key={pv.id} style={[styles.visitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {/* Card Top: Plan Code + Status Badge */}
                    <View style={styles.cardTopRow}>
                      <View style={styles.planCodeBadge}>
                        <Text style={styles.planCodeText}>{pv.planCode || 'PLAN'}</Text>
                      </View>
                      {isCheckedIn ? (
                        <View style={[styles.statusBadge, { backgroundColor: isReportSubmitted ? 'rgba(168, 85, 247, 0.2)' : 'rgba(16, 185, 129, 0.2)' }]}>
                          <ClockIcon color={isReportSubmitted ? '#A855F7' : '#10B981'} size={12} style={{ marginRight: 4 }} />
                          <Text style={[styles.statusBadgeText, { color: isReportSubmitted ? '#C084FC' : '#10B981', fontWeight: '800' }]}>
                            {isReportSubmitted ? 'Report Submitted' : `Checked In (${activeData?.checkInTime || 'Active'})`}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: status.color }]}>
                            {status.label}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Main Info */}
                    <Text style={[styles.siteNameText, { color: colors.text }]}>{pv.siteName || 'Unassigned Site'}</Text>
                    
                    <View style={styles.metaRow}>
                      <Building color={colors.textVariant} size={14} style={{ marginRight: 6 }} />
                      <Text style={[styles.metaText, { color: colors.textVariant }]}>{pv.clientName || 'Client'}</Text>
                    </View>

                    <View style={styles.metaRow}>
                      <CalendarDays color={colors.textVariant} size={14} style={{ marginRight: 6 }} />
                      <Text style={[styles.metaText, { color: colors.textVariant }]}>{pv.plannedPeriod || pv.date || 'Weekly Visit'}</Text>
                    </View>

                    {/* Card Bottom: Progress Bar + Action Button */}
                    <View style={styles.cardBottomRow}>
                      <View style={styles.progressWrap}>
                        <Text style={[styles.progressLabel, { color: colors.textVariant }]}>
                          {status.done}/{status.total} {t('visits_done')}
                        </Text>
                        <View style={[styles.progressBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
                          <View
                            style={[
                              styles.progressBarFill,
                              {
                                width: `${Math.min((status.done / status.total) * 100, 100)}%`,
                                backgroundColor: status.color,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      {isCheckedIn ? (
                        isReportSubmitted ? (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={[styles.startBtn, { backgroundColor: '#EF4444' }]}
                            onPress={() => handleCheckOutVisit(pv)}
                          >
                            <LogOut color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                            <Text style={styles.startBtnText}>Check-Out</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={[styles.startBtn, { backgroundColor: '#3B82F6' }]}
                            onPress={() => handleSubmitReportNav(pv)}
                          >
                            <FileText color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                            <Text style={styles.startBtnText}>Submit Report</Text>
                          </TouchableOpacity>
                        )
                      ) : !hasSiteCoords && !isCustomVisit ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              borderWidth: 1,
                              borderColor: 'rgba(245, 158, 11, 0.4)',
                              borderRadius: 8,
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                            }}
                          >
                            <AlertCircle color="#F59E0B" size={12} style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B' }}>
                              Site Coords Missing
                            </Text>
                          </View>
                        </View>
                      ) : !userLocation && !isCustomVisit ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              borderWidth: 1,
                              borderColor: 'rgba(59, 130, 246, 0.4)',
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <ActivityIndicator size={12} color="#60A5FA" style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#60A5FA' }}>
                              Acquiring GPS...
                            </Text>
                          </View>
                        </View>
                      ) : isOutsideGeofence && !isCustomVisit ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              borderWidth: 1,
                              borderColor: 'rgba(239, 68, 68, 0.4)',
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              marginBottom: 4,
                            }}
                          >
                            <Navigation color="#EF4444" size={12} style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>
                              {distanceMeters !== null
                                ? distanceMeters >= 1000
                                  ? `${parseFloat((distanceMeters / 1000).toFixed(1))}km Away`
                                  : `${distanceMeters}m Away`
                                : 'Not at Site'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={fetchCurrentLocation}
                            style={{ flexDirection: 'row', alignItems: 'center' }}
                          >
                            <RefreshCw color="#60A5FA" size={10} style={{ marginRight: 3 }} />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#60A5FA' }}>Refresh Location</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={[styles.startBtn, { backgroundColor: '#10B981' }]}
                          onPress={() => handleCheckIn(pv)}
                        >
                          <LogIn color="#FFFFFF" size={13} style={{ marginRight: 4 }} />
                          <Text style={styles.startBtnText}>
                            {t('check_in_now') || 'Check-In'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* COMPLETED TAB */}
        {activeTab === 'completed' && (
          <>
            {completedVisits.length === 0 ? (
              <View style={styles.emptyBox}>
                <AlertCircle color={colors.textVariant} size={48} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('no_reports_yet')}</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textVariant }]}>{t('no_completed_visits_desc')}</Text>
              </View>
            ) : (
              completedVisits.map((visit, index) => (
                <TouchableOpacity
                  key={`${visit.id}_${index}`}
                  activeOpacity={0.85}
                  onPress={() => setSelectedReport(visit)}
                  style={[styles.visitCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  {/* Top row: Visit Type Badge + Completed Status */}
                  <View style={styles.cardTopRow}>
                    <View style={[
                      styles.visitTypeBadge,
                      visit.visitType.includes('Day') && { backgroundColor: 'rgba(245,158,11,0.15)' },
                      visit.visitType.includes('Night') && { backgroundColor: 'rgba(129,140,248,0.15)' },
                      visit.visitType.includes('General') && { backgroundColor: 'rgba(52,211,153,0.15)' },
                    ]}>
                      <Text style={[
                        styles.visitTypeBadgeText,
                        visit.visitType.includes('Day') && { color: '#F59E0B' },
                        visit.visitType.includes('Night') && { color: '#818CF8' },
                        visit.visitType.includes('General') && { color: '#34D399' },
                      ]}>
                        {visit.visitType}
                      </Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                      <CheckCircle2 color="#10B981" size={12} style={{ marginRight: 4 }} />
                      <Text style={[styles.statusBadgeText, { color: '#10B981' }]}>{t('completed')}</Text>
                    </View>
                  </View>

                  {/* Report ID */}
                  <Text style={[styles.reportNoText, { color: colors.textVariant }]} numberOfLines={1} ellipsizeMode="tail">
                    {visit.reportNo}
                  </Text>

                  {/* Site & Client */}
                  <Text style={[styles.siteNameText, { color: colors.text }]} numberOfLines={1}>
                    {visit.siteName}
                  </Text>
                  <Text style={[styles.clientNameText, { color: colors.textVariant }]} numberOfLines={1}>{visit.clientName}</Text>

                  <View style={styles.divider} />

                  {/* Date Footer & Email Action */}
                  <View style={styles.cardBottomRow}>
                    <View style={styles.metaItem}>
                      <CalendarDays color={colors.textVariant} size={13} style={{ marginRight: 4 }} />
                      <Text style={[styles.metaText, { color: colors.textVariant }]}>{visit.date}</Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDownloadPdf(visit);
                      }}
                      disabled={downloadingPdfId === (visit.id || visit.reportNo)}
                      style={styles.cardDownloadPdfBtn}
                    >
                      {downloadingPdfId === (visit.id || visit.reportNo) ? (
                        <ActivityIndicator size="small" color="#3B82F6" style={{ marginRight: 4 }} />
                      ) : (
                        <Download color="#3B82F6" size={14} style={{ marginRight: 4 }} />
                      )}
                      <Text style={styles.cardDownloadPdfBtnText}>
                        {downloadingPdfId === (visit.id || visit.reportNo) ? 'Generating...' : 'Download PDF'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* COMPLETED REPORT & EMAIL MODAL */}
      <Modal
        visible={!!selectedReport}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSelectedReport(null);
          setIsEmailFormOpen(false);
        }}
      >
        <View style={[styles.detailOverlay, { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.4)' }]}>
          <View style={[styles.detailContainer, { backgroundColor: colors.card, borderColor: colors.border }, isEmailFormOpen ? { padding: 20 } : null]}>
            {isEmailFormOpen ? (
              /* --- EMAIL FORM VIEW --- */
              <View>
                <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
                  <TouchableOpacity
                    onPress={() => setIsEmailFormOpen(false)}
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                  >
                    <ArrowLeft color="#3B82F6" size={20} style={{ marginRight: 8 }} />
                    <View>
                      <Text style={[styles.detailTitle, { color: colors.text }]}>Send Report via Email</Text>
                      <Text style={[styles.detailSubtitle, { color: colors.primary }]}>{selectedReport?.reportNo}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedReport(null);
                      setIsEmailFormOpen(false);
                    }}
                    style={[styles.detailCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
                  >
                    <X color={colors.textVariant} size={22} />
                  </TouchableOpacity>
                </View>

                <View style={{ marginVertical: 14 }}>
                  <Text style={[styles.emailFormLabel, { color: colors.textVariant }]}>RECIPIENT EMAIL *</Text>
                  <TextInput
                    style={[styles.emailTextInput, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border, color: colors.text }]}
                    placeholder="client.rep@company.com"
                    placeholderTextColor={colors.textVariant}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={recipientEmail}
                    onChangeText={setRecipientEmail}
                  />

                  <Text style={[styles.emailFormLabel, { color: colors.textVariant, marginTop: 12 }]}>SUBJECT</Text>
                  <TextInput
                    style={[styles.emailTextInput, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border, color: colors.text }]}
                    placeholder="Email Subject..."
                    placeholderTextColor={colors.textVariant}
                    value={emailSubject}
                    onChangeText={setEmailSubject}
                  />

                  <Text style={[styles.emailFormLabel, { color: colors.textVariant, marginTop: 12 }]}>MESSAGE</Text>
                  <TextInput
                    style={[styles.emailTextInput, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border, color: colors.text, height: 90, textAlignVertical: 'top' }]}
                    placeholder="Enter custom email message..."
                    placeholderTextColor={colors.textVariant}
                    multiline
                    numberOfLines={4}
                    value={emailMessage}
                    onChangeText={setEmailMessage}
                  />
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={emailSending}
                  onPress={handleSendEmail}
                  style={styles.sendEmailSubmitBtn}
                >
                  {emailSending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Mail color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                      <Text style={styles.sendEmailSubmitBtnText}>SEND EMAIL REPORT</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              /* --- REPORT PREVIEW VIEW --- */
              <>
                {/* Header Close Bar */}
                <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedReport?.reportNo}</Text>
                    <Text style={[styles.detailSubtitle, { color: colors.primary }]}>{selectedReport?.visitType}</Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleDownloadPdf(selectedReport)}
                    disabled={downloadingPdfId === (selectedReport?.id || selectedReport?.reportNo)}
                    style={styles.headerDownloadPdfBtn}
                  >
                    {downloadingPdfId === (selectedReport?.id || selectedReport?.reportNo) ? (
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 5 }} />
                    ) : (
                      <Download color="#FFFFFF" size={16} style={{ marginRight: 5 }} />
                    )}
                    <Text style={styles.headerDownloadPdfBtnText}>
                      {downloadingPdfId === (selectedReport?.id || selectedReport?.reportNo) ? 'Generating...' : 'Download PDF'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setSelectedReport(null);
                      setIsEmailFormOpen(false);
                    }}
                    style={[styles.detailCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
                  >
                    <X color={colors.textVariant} size={22} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                  {/* Corporate Banner Header (Exact WEB Match) */}
                  <View style={[styles.previewCorporateBanner, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#1E3A8A' : 'rgba(41, 121, 255, 0.3)' }]}>
                    <View style={styles.bannerHeaderTopRow}>
                      <Image
                        source={getReportCompany(selectedReport).logo}
                        style={{ width: 28, height: 28, resizeMode: 'contain', marginRight: 8 }}
                      />
                      <Text style={[styles.companyNameTitle, { color: colors.text }]}>{getReportCompany(selectedReport).name}</Text>
                    </View>

                    <View style={styles.reportTitleBanner}>
                      <Text style={styles.reportMainHeading}>
                        {selectedReport?.visitType === 'Day Visit'
                          ? 'OFFICER DAY VISIT REPORT'
                          : selectedReport?.visitType === 'Night Round'
                          ? 'OFFICER NIGHT VISIT REPORT'
                          : 'OFFICER GENERAL VISIT REPORT'}
                      </Text>
                      <Text style={styles.reportIdTag}>REPORT ID : {selectedReport?.reportNo}</Text>
                    </View>

                    <View style={styles.bannerDateRow}>
                      <ClockIcon color={colors.textVariant} size={13} style={{ marginRight: 4 }} />
                      <Text style={[styles.bannerDateText, { color: colors.textVariant }]}>
                        DATE : {selectedReport?.date} | {selectedReport?.rawReport?.['check-in_time'] || selectedReport?.rawReport?.start_time || selectedReport?.rawReport?.startTime || '09:00'} - {selectedReport?.rawReport?.['check-out_time'] || selectedReport?.rawReport?.end_time || selectedReport?.rawReport?.endTime || '17:00'}
                      </Text>
                    </View>
                  </View>

                  {/* 1. General Information Card (Navy Section Header) */}
                  <View style={[styles.detailSectionCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                    <View style={styles.navySectionTitleBox}>
                      <Text style={styles.navySectionTitle}>GENERAL INFORMATION</Text>
                    </View>
                    <View style={styles.gridInfoBox}>
                      <View style={[styles.infoRowItem, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                        <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Client Name</Text>
                        <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.clientName || 'ADIENT INDIA PVT LTD'}</Text>
                      </View>
                      <View style={[styles.infoRowItem, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                        <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Site Name</Text>
                        <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.siteName || 'ADIENT - PIMPRI'}</Text>
                      </View>
                      <View style={[styles.infoRowItem, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                        <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Shift</Text>
                        <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.rawReport?.shift || (selectedReport?.visitType === 'Night Round' ? 'Night Shift' : 'Day Shift')}</Text>
                      </View>
                      <View style={[styles.infoRowItem, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                        <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Visit Type</Text>
                        <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.visitType}</Text>
                      </View>
                      <View style={[styles.infoRowItem, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                        <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Officer Name</Text>
                        <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.officer || 'Amit Kulkarni'}</Text>
                      </View>
                      <View style={[styles.infoRowItem, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                        <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Start Time</Text>
                        <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.rawReport?.['check-in_time'] || selectedReport?.rawReport?.start_time || selectedReport?.rawReport?.startTime || '—'}</Text>
                      </View>
                      <View style={[styles.infoRowItem, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                        <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>End Time</Text>
                        <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.rawReport?.['check-out_time'] || selectedReport?.rawReport?.end_time || selectedReport?.rawReport?.endTime || '—'}</Text>
                      </View>
                      <View style={[styles.infoRowItem, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                        <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>GPS Location</Text>
                        <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.rawReport?.gps || 'Location Logged'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* 2. Visit Parameters & Scope (General Visit) */}
                  {selectedReport?.visitType === 'General Audit' && (
                    <View style={[styles.detailSectionCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                      <View style={styles.navySectionTitleBox}>
                        <Text style={styles.navySectionTitle}>VISIT PARAMETERS & SCOPE</Text>
                      </View>
                      <View style={styles.gridInfoBox}>
                        <View style={[styles.infoRowItemFull, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                          <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Person Visited</Text>
                          <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.rawReport?.person_visited || selectedReport?.rawReport?.personVisited || 'N/A'}</Text>
                        </View>
                        <View style={[styles.infoRowItemFull, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                          <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Reason of Visit</Text>
                          <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.rawReport?.reason_of_visit || selectedReport?.rawReport?.reasonOfVisit || 'Routine Security Audit'}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 3. Guards Present on Duty */}
                  {selectedReport?.visitType !== 'General Audit' && (() => {
                    let guardsList: any[] = [];
                    const rawG = selectedReport?.rawReport?.guards;
                    if (Array.isArray(rawG)) guardsList = rawG;
                    else if (typeof rawG === 'string' && rawG.trim()) {
                      try { guardsList = JSON.parse(rawG); } catch (e) {}
                    }
                    return (
                      <View style={[styles.detailSectionCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                        <View style={styles.navySectionTitleBox}>
                          <Text style={styles.navySectionTitle}>GUARDS PRESENT ON DUTY ({guardsList.length})</Text>
                        </View>
                        {guardsList.length > 0 ? (
                          <View style={[styles.tableWrap, { backgroundColor: isDark ? 'rgba(15,23,42,0.4)' : '#FFFFFF' }]}>
                            <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                              <Text style={[styles.thCell, { flex: 0.5, color: colors.text }]}>#</Text>
                              <Text style={[styles.thCell, { flex: 2, color: colors.text }]}>Guard Name</Text>
                              <Text style={[styles.thCell, { flex: 1, color: colors.text }]}>Emp Code</Text>
                              <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right', color: colors.text }]}>Status</Text>
                            </View>
                            {guardsList.map((g: any, idx: number) => (
                              <View key={idx} style={[styles.tableBodyRow, { borderBottomColor: colors.border }]}>
                                <Text style={[styles.tdCell, { flex: 0.5, color: colors.textVariant }]}>{idx + 1}</Text>
                                <Text style={[styles.tdCell, { flex: 2, fontWeight: '700', color: colors.text }]}>{g.name || 'Guard'}</Text>
                                <Text style={[styles.tdCell, { flex: 1, color: colors.textVariant }]}>{g.empCode || g.employeeId || g.emp_code || 'G'}</Text>
                                <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                                  <View style={[styles.statusBadgePill, g.present !== false && g.status !== 'Absent' ? styles.statusBadgeSuccess : styles.statusBadgeDanger]}>
                                    <Text style={styles.statusBadgePillText}>{g.status || (g.present !== false ? 'Present' : 'Absent')}</Text>
                                  </View>
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={[styles.emptyTableText, { color: colors.textVariant }]}>No guards listed for this visit.</Text>
                        )}
                      </View>
                    );
                  })()}

                  {/* 4. Inspection Checklist Items */}
                  {selectedReport?.visitType !== 'General Audit' && (() => {
                    let checklistList: any[] = [];
                    const rawC = selectedReport?.rawReport?.checklist;
                    if (Array.isArray(rawC)) checklistList = rawC;
                    else if (typeof rawC === 'string' && rawC.trim()) {
                      try { checklistList = JSON.parse(rawC); } catch (e) {}
                    }
                    return (
                      <View style={[styles.detailSectionCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                        <View style={styles.navySectionTitleBox}>
                          <Text style={styles.navySectionTitle}>INSPECTION CHECKLIST ITEMS ({checklistList.length})</Text>
                        </View>
                        {checklistList.length > 0 ? (
                          <View style={[styles.tableWrap, { backgroundColor: isDark ? 'rgba(15,23,42,0.4)' : '#FFFFFF' }]}>
                            {checklistList.map((item: any, idx: number) => {
                              const qText = item.question || item.title || String(item);
                              const statusStr = item.status || item.answer || 'Satisfactory';
                              const isNegative = statusStr === 'Unsatisfactory' || statusStr === 'NO' || statusStr === 'NOT OK';
                              return (
                                <View key={idx} style={[styles.checklistRow, { borderBottomColor: colors.border }]}>
                                  <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text style={[styles.questionText, { color: colors.text }]}>{idx + 1}. {qText}</Text>
                                    {item.remarks || item.observation ? (
                                      <Text style={[styles.questionRemarkText, { color: colors.textVariant }]}>Remarks: {item.remarks || item.observation}</Text>
                                    ) : null}
                                  </View>
                                  <View style={[styles.statusBadgePill, !isNegative ? styles.statusBadgeSuccess : styles.statusBadgeDanger]}>
                                    <Text style={styles.statusBadgePillText}>{statusStr}</Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={[styles.emptyTableText, { color: colors.textVariant }]}>No checklist items recorded.</Text>
                        )}
                      </View>
                    );
                  })()}

                  {/* 5. Lecture & Random Checking (Night Visit) */}
                  {selectedReport?.visitType === 'Night Round' && (
                    <View style={[styles.detailSectionCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                      <View style={styles.navySectionTitleBox}>
                        <Text style={styles.navySectionTitle}>BRIEFING, LECTURE & RANDOM CHECKING</Text>
                      </View>
                      <View style={styles.gridInfoBox}>
                        <View style={[styles.infoRowItemFull, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                          <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Short Lecture Details</Text>
                          <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.rawReport?.lecture_details || selectedReport?.rawReport?.lectureDetails || 'No short lecture details recorded.'}</Text>
                        </View>
                        <View style={[styles.infoRowItemFull, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                          <Text style={[styles.gridLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Random Checking Details</Text>
                          <Text style={[styles.gridValue, { color: colors.text }]}>{selectedReport?.rawReport?.random_checking || selectedReport?.rawReport?.randomChecking || 'No random checking details recorded.'}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 6. Photo Evidence */}
                  {(() => {
                    const rawPhotos = selectedReport?.rawReport?.photos || selectedReport?.rawReport?.photo_evidence || [];
                    const baseList = Array.isArray(rawPhotos) ? rawPhotos : (typeof rawPhotos === 'string' ? (JSON.parse(rawPhotos || '[]') || []) : []);
                    const rawChecklist = selectedReport?.rawReport?.checklist;
                    const parsedChecklist = Array.isArray(rawChecklist) ? rawChecklist : (typeof rawChecklist === 'string' ? (JSON.parse(rawChecklist || '[]') || []) : []);
                    const checklistPhotos = (parsedChecklist || []).map((c: any) => c.photo || (Array.isArray(c.photos) ? c.photos[0] : null)).filter(Boolean);
                    const allPhotos = Array.from(new Set([...baseList, ...checklistPhotos])).filter(Boolean);

                    const resolveMobilePhotoUrl = (url: string) => {
                      if (!url || typeof url !== 'string') return '';
                      if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) {
                        return url;
                      }
                      if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
                        const clean = url.startsWith('/') ? url : `/${url}`;
                        const rawApi = process.env.EXPO_PUBLIC_API_URL || 'https://tarot-carrot-celery.ngrok-free.dev';
                        const serverHost = rawApi.replace(/\/api\/?$/, '');
                        return `${serverHost}${clean}`;
                      }
                      return url;
                    };

                    if (allPhotos.length === 0) return null;

                    return (
                      <View style={[styles.detailSectionCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                        <View style={styles.navySectionTitleBox}>
                          <Text style={styles.navySectionTitle}>PHOTO EVIDENCE ({allPhotos.length})</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 8 }}>
                          {allPhotos.map((p: any, idx: number) => {
                            const fullUrl = resolveMobilePhotoUrl(String(p));
                            return (
                              <View key={idx} style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#E2E8F0' }}>
                                <Image
                                  source={{ uri: fullUrl, headers: { 'ngrok-skip-browser-warning': 'true' } }}
                                  style={{ width: '100%', height: '100%' }}
                                  resizeMode="cover"
                                />
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })()}

                  {/* 7. Remarks & Customer Feedback */}
                  <View style={[styles.detailSectionCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                    <View style={styles.navySectionTitleBox}>
                      <Text style={styles.navySectionTitle}>REMARKS & OFFICER SUGGESTIONS</Text>
                    </View>
                    <View style={[styles.remarkContentBox, { backgroundColor: isDark ? 'rgba(15,23,42,0.6)' : '#FFFFFF', borderColor: colors.border }]}>
                      <Text style={[styles.remarkContentText, { color: colors.text }]}>
                        {selectedReport?.rawReport?.overall_remarks ||
                         selectedReport?.rawReport?.suggestions ||
                         selectedReport?.rawReport?.remark ||
                         'No additional remarks recorded.'}
                      </Text>
                    </View>
                  </View>

                  {/* 8. Action Button: Send Email Report */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleOpenEmailForm(selectedReport)}
                    style={styles.sendEmailModalActionBtn}
                  >
                    <Mail color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.sendEmailModalActionBtnText}>SEND REPORT VIA EMAIL</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ACTIVE VISIT CHECK-OUT ENFORCER MODAL */}
      <Modal
        visible={enforcerModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEnforcerModal({ visible: false })}
      >
        <View style={styles.enforcerModalOverlay}>
          <View style={styles.enforcerModalCard}>
            <View style={styles.enforcerIconBox}>
              <ShieldAlert size={44} color="#EF4444" />
            </View>

            <Text style={styles.enforcerTitle}>Active Visit Session Detected</Text>

            <Text style={styles.enforcerMessage}>
              You are currently checked into <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>'{enforcerModal.activeSiteName || 'Previous Site'}'</Text> since {enforcerModal.activeStartTime ? new Date(enforcerModal.activeStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'earlier'}.
              {'\n\n'}
              Please check out of your previous visit before starting a new visit.
            </Text>

            <TouchableOpacity
              style={styles.enforcerCheckoutBtn}
              activeOpacity={0.8}
              onPress={handleForceCheckoutPreviousVisit}
            >
              <LogOutIcon size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.enforcerCheckoutBtnText}>Check Out Previous Visit Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.enforcerCancelBtn}
              activeOpacity={0.7}
              onPress={() => setEnforcerModal({ visible: false })}
            >
              <Text style={styles.enforcerCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  tabActiveGreen: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  // Visit Card
  visitCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  planCodeBadge: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planCodeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  reportNoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  visitTypeBadge: {
    flexShrink: 0,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  visitTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
  },
  siteNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 3,
    lineHeight: 22,
  },
  clientNameText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressWrap: {
    flex: 1,
    marginRight: 12,
  },
  progressLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 5,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  startBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardDownloadPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cardDownloadPdfBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  headerDownloadPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 10,
  },
  headerDownloadPdfBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Empty state
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  // Detail Modal Styles
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  detailContainer: {
    backgroundColor: THEME.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.text,
  },
  detailSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.primary,
    marginTop: 2,
  },
  detailCloseBtn: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
  },
  detailSectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.textVariant,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  remarkBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  remarkText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 18,
  },
  // Corporate Banner WEB Style
  previewCorporateBanner: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#1E3A8A',
  },
  bannerHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  companyNameTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  reportTitleBanner: {
    backgroundColor: '#1E3A8A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  reportMainHeading: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  reportIdTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#93C5FD',
    textAlign: 'center',
    marginTop: 3,
  },
  bannerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  bannerDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  navySectionTitleBox: {
    backgroundColor: '#1E3A8A',
    borderLeftWidth: 4,
    borderLeftColor: '#60A5FA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  navySectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  gridInfoBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoRowItem: {
    width: '48%',
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  infoRowItemFull: {
    width: '100%',
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  tableWrap: {
    backgroundColor: 'rgba(15,23,42,0.4)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC',
    textTransform: 'uppercase',
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tdCell: {
    fontSize: 12,
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeSuccess: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  statusBadgeDanger: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  statusBadgePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  emptyTableText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    padding: 10,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  questionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F1F5F9',
    lineHeight: 16,
  },
  questionRemarkText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    fontStyle: 'italic',
  },
  remarkContentBox: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  remarkContentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
    lineHeight: 18,
  },
  headerEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 10,
  },
  headerEmailBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  sendEmailModalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
    marginBottom: 6,
  },
  sendEmailModalActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  emailFormLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  emailTextInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
  },
  sendEmailSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  sendEmailSubmitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  cardEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  cardEmailBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  disabledCardEmailBtn: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    borderColor: 'rgba(100, 116, 139, 0.25)',
  },
  disabledCardEmailBtnText: {
    color: '#64748B',
  },
  disabledHeaderEmailBtn: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    borderColor: 'rgba(100, 116, 139, 0.25)',
  },
  disabledHeaderEmailBtnText: {
    color: '#64748B',
  },
  // Active Visit Session Banner Styles
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderColor: '#3B82F6',
    borderWidth: 1.5,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    elevation: 4,
  },
  activeSessionTextCol: {
    flex: 1,
    marginRight: 10,
  },
  activeSessionPulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  activeSessionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#60A5FA',
    letterSpacing: 0.8,
  },
  activeSessionSiteName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  activeSessionSubText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  activeSessionCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  activeSessionCheckoutBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Active Visit Enforcer Modal Styles
  enforcerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  enforcerModalCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    padding: 24,
    alignItems: 'center',
    elevation: 10,
  },
  enforcerIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  enforcerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  enforcerMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  enforcerCheckoutBtn: {
    width: '100%',
    height: 50,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  enforcerCheckoutBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  enforcerCancelBtn: {
    width: '100%',
    height: 44,
    backgroundColor: 'transparent',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  enforcerCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
