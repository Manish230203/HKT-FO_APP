import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  Edit,
  FileText,
  Trash2,
  Plus,
  Search,
  Loader2,
  MapPin,
  Mail,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getStoredReports, saveStoredReports } from "./mockData";
import api from "../../services/api";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import JSZip from "jszip";
// @ts-ignore
import html2pdf from "html2pdf.js";

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return "N/A";
  return timeStr;
};

const RibbonHeader = ({ title }) => (
  <div className="relative inline-block mb-3 print:mb-2 text-left">
    <div className="bg-[#1e3a8a] text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-l-[4px] relative z-10 select-none">
      {title}
    </div>
    <div
      className="absolute top-0 right-[-10px] h-full w-[10px] bg-[#1e3a8a] z-0"
      style={{ clipPath: "polygon(0 0, 0 100%, 100% 100%)" }}
    />
  </div>
);

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  if (typeof dateStr === "string" && dateStr.includes("-")) {
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }
  return new Date(dateStr);
};

export default function NightVisitReportsList() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [officerFilter, setOfficerFilter] = useState("all");
  const [dateRangeType, setDateRangeType] = useState("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [sites, setSites] = useState([]);
  const [branches, setBranches] = useState([]);
  const [officers, setOfficers] = useState([]);

  // Selection states
  const [selectedRoundIds, setSelectedRoundIds] = useState([]);
  const [bulkRoundDetails, setBulkRoundDetails] = useState([]);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [clients, setClients] = useState([]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await api.get("/assessments/clients");
        setClients(res.data || []);
      } catch (err) {
        console.error("Failed to fetch clients:", err);
      }
    };
    fetchClients();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await api.get("/officer-rounds/reports");
      const loadedReports = res.data;
      if (loadedReports && loadedReports.length > 0) {
        setReports(loadedReports);
      } else {
        setReports(getStoredReports());
      }
    } catch (err) {
      console.error(
        "Failed to fetch reports from API, falling back to localStorage:",
        err,
      );
      setReports(getStoredReports());
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    const fetchSites = async () => {
      try {
        const res = await api.get("/assessments/sites");
        setSites(res.data || []);
      } catch (error) {
        console.error("Failed to fetch sites:", error);
      }
    };
    const fetchBranches = async () => {
      try {
        const res = await api.get("/assessments/branches");
        setBranches(res.data || []);
      } catch (err) {
        console.error("Failed to fetch branches:", err);
      }
    };
    fetchSites();
    fetchBranches();
  }, []);

  useEffect(() => {
    const uniqueOfficers = Array.from(new Set(reports.map((r) => r.officer)));
    setOfficers(uniqueOfficers);
  }, [reports]);

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this report?")) {
      try {
        await api.delete(`/officer-rounds/reports/${id}`);
        fetchReports();
      } catch (err) {
        console.error(
          "Failed to delete report from API, falling back to localStorage:",
          err,
        );
        const updated = reports.filter((r) => r.id !== id);
        saveStoredReports(updated);
        setReports(updated);
      }
    }
  };

  const handleDownloadPDF = async (reportId) => {
    const toastId = toast.loading("Generating PDF report...");
    try {
      let reportDetail = reports.find((r) => r.id === reportId);
      if (!reportDetail) {
        try {
          const resp = await api.get(`/officer-rounds/reports/${reportId}`);
          reportDetail = resp.data;
        } catch {
          reportDetail = getStoredReports().find((r) => r.id === reportId);
        }
      }
      if (!reportDetail) {
        throw new Error("Report details not found");
      }

      setBulkRoundDetails([reportDetail]);

      // Wait for React to complete rendering
      await new Promise((resolve) => setTimeout(resolve, 600));

      const container = document.getElementById(
        "bulk-round-print-pdf-container",
      );
      if (!container) {
        throw new Error("Print container not found in DOM");
      }

      const originalDisplay = container.style.display;
      const originalPosition = container.style.position;
      const originalLeft = container.style.left;
      const originalTop = container.style.top;

      container.style.display = "block";
      container.style.position = "absolute";
      container.style.left = "20000px";
      container.style.top = "0";

      const reportElements = Array.from(container.children).filter(
        (el) => el.tagName === "DIV",
      );

      const clientName = reportDetail.clientId
        ? clients.find((c) => c.id === reportDetail.clientId)?.name ||
        `Client #${reportDetail.clientId}`
        : "N/A";
      const formatDateToDMY = (dateStr) => {
        if (!dateStr) return "DD/MM/YY";
        try {
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return dateStr.replace(/-/g, "/");
          return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear().toString().slice(-2)}`;
        } catch {
          return dateStr;
        }
      };
      const formattedReportId = `${clientName}-${reportDetail.unit}-ONR-${formatDateToDMY(reportDetail.visitDate)}`;
      const filename = `${formattedReportId.replace(/\//g, "-")}.pdf`;

      const options = {
        margin: 10,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      const element = reportElements[0];
      await html2pdf().set(options).from(element).save(filename);

      container.style.display = originalDisplay;
      container.style.position = originalPosition;
      container.style.left = originalLeft;
      container.style.top = originalTop;
      setBulkRoundDetails([]);

      toast.success("PDF report downloaded successfully.", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF report.", { id: toastId });
      setBulkRoundDetails([]);
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const pageIds = currentItems.map((item) => item.id);
      setSelectedRoundIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIds = currentItems.map((item) => item.id);
      setSelectedRoundIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    }
  };

  const handleSelectRow = (id, checked) => {
    if (checked) {
      setSelectedRoundIds((prev) => [...prev, id]);
    } else {
      setSelectedRoundIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const fetchAllSelectedRoundDetails = async () => {
    setBulkExporting(true);
    const toastId = toast.loading(
      `Fetching details for ${selectedRoundIds.length} round report(s)...`,
    );
    try {
      const details = await Promise.all(
        selectedRoundIds.map(async (id) => {
          try {
            const resp = await api.get(`/officer-rounds/reports/${id}`);
            return resp.data;
          } catch (err) {
            console.warn(
              "Failed to load details from API for report",
              id,
              "falling back to localStorage",
            );
            const local = getStoredReports().find((r) => r.id === id);
            if (local) return local;
            throw err;
          }
        }),
      );
      toast.success("Round report details loaded successfully.", {
        id: toastId,
      });
      return details;
    } catch (err) {
      toast.error("Failed to load details for one or more round reports.", {
        id: toastId,
      });
      throw err;
    } finally {
      setBulkExporting(false);
    }
  };

  const handleBulkExportPDF = async () => {
    if (clientFilter === "all") {
      alert("Please select a specific client first to download bulk PDFs.");
      return;
    }
    if (selectedRoundIds.length === 0) {
      alert("Please select at least one report to download.");
      return;
    }
    try {
      const details = await fetchAllSelectedRoundDetails();
      if (!details || details.length === 0) return;

      const toastId = toast.loading(
        `Generating separate PDFs for ${details.length} round report(s)...`,
      );

      // Render selected reports into DOM printable container
      setBulkRoundDetails(details);

      // Wait for React to complete rendering
      await new Promise((resolve) => setTimeout(resolve, 600));

      const container = document.getElementById(
        "bulk-round-print-pdf-container",
      );
      if (!container) {
        throw new Error("Print container not found in DOM");
      }

      // Temporarily show the container off-screen
      const originalDisplay = container.style.display;
      const originalPosition = container.style.position;
      const originalLeft = container.style.left;
      const originalTop = container.style.top;

      container.style.display = "block";
      container.style.position = "absolute";
      container.style.left = "20000px";
      container.style.top = "0";

      // Select all actual report divs
      const reportElements = Array.from(container.children).filter(
        (el) => el.tagName === "DIV",
      );

      const zip = new JSZip();
      const options = {
        margin: 10,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      for (let i = 0; i < reportElements.length; i++) {
        const detail = details[i];
        const clientName = detail.clientId
          ? clients.find((c) => c.id === detail.clientId)?.name ||
          `Client #${detail.clientId}`
          : "N/A";
        const formatDateToDMY = (dateStr) => {
          if (!dateStr) return "DD/MM/YY";
          try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) {
              return dateStr.replace(/-/g, "/");
            }
            const day = d.getDate().toString().padStart(2, "0");
            const month = (d.getMonth() + 1).toString().padStart(2, "0");
            const year = d.getFullYear().toString().slice(-2);
            return `${day}/${month}/${year}`;
          } catch (e) {
            return dateStr;
          }
        };
        const reportId = `${clientName}-${detail.unit}-ONR-${formatDateToDMY(detail.visitDate)}`;
        const filename = `${reportId.replace(/\//g, "-")}.pdf`;

        const element = reportElements[i];
        const blob = await html2pdf()
          .set(options)
          .from(element)
          .toPdf()
          .outputPdf("blob");
        zip.file(filename, blob);

        toast.loading(`Generated ${i + 1} of ${details.length} PDFs...`, {
          id: toastId,
        });
      }

      // Restore styling and clear state
      container.style.display = originalDisplay;
      container.style.position = originalPosition;
      container.style.left = originalLeft;
      container.style.top = originalTop;
      setBulkRoundDetails([]);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `Bulk_Officer_Round_Reports_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      toast.success(
        "Bulk PDF reports downloaded successfully as a ZIP archive.",
        { id: toastId },
      );
      setSelectedRoundIds([]);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate bulk PDF reports.");
      setBulkRoundDetails([]);
    }
  };

  // Filter logic
  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      (r.reportNo?.toLowerCase() ?? "").includes(search.toLowerCase()) ||
      (r.unit?.toLowerCase() ?? "").includes(search.toLowerCase()) ||
      (r.officer?.toLowerCase() ?? "").includes(search.toLowerCase());

    const matchesClient = clientFilter === "all" || r.clientId == clientFilter;

    // Resolve branch using site
    let matchesBranch = true;
    if (branchFilter !== "all") {
      const siteObj = sites.find((s) => s.id === r.siteId || s.name === r.unit);
      matchesBranch = siteObj && siteObj.BRANCH == branchFilter;
    }

    const matchesSite = siteFilter === "all" || r.siteId == siteFilter || r.unit === siteFilter;

    const matchesOfficer =
      officerFilter === "all" || r.officer === officerFilter;

    let matchesDate = true;
    const rawDate = r.visitDate || r.createdOn || r.createdAt;
    if (rawDate) {
      const reportDate = parseLocalDate(rawDate);
      if (reportDate && !isNaN(reportDate.getTime())) {
        reportDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateRangeType === "today") {
          matchesDate = reportDate.getTime() === today.getTime();
        } else if (dateRangeType === "yesterday") {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          matchesDate = reportDate.getTime() === yesterday.getTime();
        } else if (dateRangeType === "weekly") {
          const startOfWeek = new Date(today);
          startOfWeek.setDate(startOfWeek.getDate() - 7);
          matchesDate =
            reportDate.getTime() >= startOfWeek.getTime() &&
            reportDate.getTime() <= today.getTime();
        } else if (dateRangeType === "custom") {
          if (startDate) {
            const start = parseLocalDate(startDate);
            if (start && !isNaN(start.getTime())) {
              start.setHours(0, 0, 0, 0);
              if (reportDate.getTime() < start.getTime()) matchesDate = false;
            }
          }
          if (endDate) {
            const end = parseLocalDate(endDate);
            if (end && !isNaN(end.getTime())) {
              end.setHours(23, 59, 59, 999);
              if (reportDate.getTime() > end.getTime()) matchesDate = false;
            }
          }
        }
      }
    }

    return (
      matchesSearch &&
      matchesClient &&
      matchesBranch &&
      matchesSite &&
      matchesOfficer &&
      matchesDate
    );
  });

  // Calculate statistics
  const totalCount = reports.length;
  const completedCount = reports.filter((r) => r.status === "Completed").length;
  const pendingCount = reports.filter((r) => r.status === "Pending").length;
  const draftCount = reports.filter((r) => r.status === "Draft").length;

  // Pagination calculation
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  // Sort by date of creation (createdOn / visitDate) newest first
  const sortedReports = [...filteredReports].sort((a, b) => {
    const timeA = a.createdOn
      ? new Date(a.createdOn).getTime()
      : a.visitDate
        ? new Date(a.visitDate).getTime()
        : 0;
    const timeB = b.createdOn
      ? new Date(b.createdOn).getTime()
      : b.visitDate
        ? new Date(b.visitDate).getTime()
        : 0;
    return timeB - timeA;
  });

  const currentItems = sortedReports.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);

  const getStatusBadge = (status) => {
    switch (status) {
      case "Completed":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none font-medium px-2 py-0.5">
            Completed
          </Badge>
        );
      case "Pending":
        return (
          <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-none font-medium px-2 py-0.5">
            Pending
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-500/10 text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-500/20 border-none font-medium px-2 py-0.5">
            Draft
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Night Visit Reports
          </h1>
        </div>
        <Button
          onClick={() => navigate("/officer-rounds/create")}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5 py-2 flex items-center gap-2 font-semibold transition-all shadow-sm"
        >
          <Plus className="h-4.5 w-4.5" />
          Create Report
        </Button>
      </div>

      {/* Filter and Table Card */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm">
        <CardContent className="p-6">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-muted-foreground" />
              <Input
                placeholder="Search report no, site, or officer..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-4 py-2 border rounded-lg text-sm bg-background w-full"
              />
            </div>

            <Select
              value={clientFilter}
              onValueChange={(val) => {
                setClientFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={branchFilter}
              onValueChange={(val) => {
                setBranchFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={siteFilter}
              onValueChange={(val) => {
                setSiteFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id.toString()}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={officerFilter}
              onValueChange={(val) => {
                setOfficerFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Officers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Officers</SelectItem>
                {officers.map((officer) => (
                  <SelectItem key={officer} value={officer}>
                    {officer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date Range Selector */}
            <Select
              value={dateRangeType}
              onValueChange={(val) => {
                setDateRangeType(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Dates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dateRangeType === "custom" && (
            <div className="grid grid-cols-2 gap-4 mt-4 mb-6 pt-4 border-t border-border/50">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full py-2 border rounded-lg text-sm bg-background cursor-pointer dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  End Date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full py-2 border rounded-lg text-sm bg-background cursor-pointer dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert"
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between bg-muted/90 dark:bg-slate-900/90 border border-border rounded-lg p-3 mt-4 mb-4 sticky top-[64px] z-30 shadow-md backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="text-xs font-semibold text-muted-foreground">
              {selectedRoundIds.length} report(s) selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={bulkExporting || selectedRoundIds.length === 0}
                className="h-8 text-xs font-bold gap-1.5 bg-background border-border hover:bg-muted text-foreground"
                onClick={handleBulkExportPDF}
              >
                {bulkExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-red-500" />
                )}
                Bulk PDF
              </Button>
              {selectedRoundIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={bulkExporting}
                  className="h-8 text-xs font-semibold hover:bg-muted"
                  onClick={() => setSelectedRoundIds([])}
                >
                  Clear Selection
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      checked={
                        currentItems.length > 0 &&
                        currentItems.every((item) =>
                          selectedRoundIds.includes(item.id),
                        )
                      }
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Report ID</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Site</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Officer</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Visit Date</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Created On</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Status</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItems.length > 0 ? (
                  currentItems.map((report, index) => (
                    <TableRow
                      key={report.id}
                      onClick={() =>
                        navigate(`/officer-rounds/preview/${report.id}`)
                      }
                      className="hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <TableCell className="w-12 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedRoundIds.includes(report.id)}
                          onCheckedChange={(checked) =>
                            handleSelectRow(report.id, !!checked)
                          }
                        />
                      </TableCell>
                      <TableCell
                        className="font-semibold text-foreground text-xs whitespace-normal break-words max-w-[220px] py-3 leading-normal"
                        title={(() => {
                          let repNo = report.reportNo || report.reportId || "";
                          if (!repNo || repNo.includes("-N/A-") || repNo.includes("-Unspecified Unit-")) {
                            const clientName = report.clientName || (report.clientId
                              ? clients.find((c) => c.id == report.clientId)?.name || `Client #${report.clientId}`
                              : "FIFA");
                            const siteName = report.unit && report.unit !== "N/A" && report.unit !== "Unspecified Unit" ? report.unit : "Portugal";
                            const formatDateToDMY = (dateStr) => {
                              if (!dateStr) return "DD/MM/YY";
                              try {
                                const d = new Date(dateStr);
                                if (isNaN(d.getTime())) return dateStr.replace(/-/g, "/");
                                return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear().toString().slice(-2)}`;
                              } catch {
                                return dateStr;
                              }
                            };
                            const siteVisits = reports
                              .filter((r) => r.siteId === report.siteId)
                              .sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));
                            const idx = siteVisits.findIndex(r => r.id === report.id);
                            const reportIndex = idx !== -1 ? String(idx + 1).padStart(2, '0') : '01';
                            return `${reportIndex}-${clientName}-${siteName}-ONR-${formatDateToDMY(report.visitDate)}`;
                          }
                          return repNo;
                        })()}
                      >
                        {(() => {
                          let repNo = report.reportNo || report.reportId || "";
                          if (!repNo || repNo.includes("-N/A-") || repNo.includes("-Unspecified Unit-")) {
                            const clientName = report.clientName || (report.clientId
                              ? clients.find((c) => c.id == report.clientId)?.name || `Client #${report.clientId}`
                              : "FIFA");
                            const siteName = report.unit && report.unit !== "N/A" && report.unit !== "Unspecified Unit" ? report.unit : "Portugal";
                            const formatDateToDMY = (dateStr) => {
                              if (!dateStr) return "DD/MM/YY";
                              try {
                                const d = new Date(dateStr);
                                if (isNaN(d.getTime())) return dateStr.replace(/-/g, "/");
                                return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear().toString().slice(-2)}`;
                              } catch {
                                return dateStr;
                              }
                            };
                            const siteVisits = reports
                              .filter((r) => r.siteId === report.siteId)
                              .sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));
                            const idx = siteVisits.findIndex(r => r.id === report.id);
                            const reportIndex = idx !== -1 ? String(idx + 1).padStart(2, '0') : '01';
                            return `${reportIndex}-${clientName}-${siteName}-ONR-${formatDateToDMY(report.visitDate)}`;
                          }
                          return repNo;
                        })()}
                      </TableCell>
                      <TableCell>{report.unit}</TableCell>
                      <TableCell>{report.officer}</TableCell>
                      <TableCell>{report.visitDate}</TableCell>
                      <TableCell>{report.createdOn}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            report.status === "Completed"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 font-bold px-2 py-0.5 rounded-full"
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 font-bold px-2 py-0.5 rounded-full"
                          }
                        >
                          {report.status || "Draft"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {report.emailAccess === 1 || report.email_access === 1 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              title="Send Report via Email"
                              onClick={() => navigate(`/officer-rounds/preview/${report.id}`)}
                            >
                              <Mail className="h-4.5 w-4.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled
                              className="h-8 w-8 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-40"
                              title="Email access is disabled for this branch (email_access = 0 in BRANCH table)"
                            >
                              <Mail className="h-4.5 w-4.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/5"
                            title="Edit Report"
                            onClick={() =>
                              navigate(
                                `/officer-rounds/create?edit=${report.id}`,
                              )
                            }
                          >
                            <Edit className="h-4.5 w-4.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/5"
                            title="Delete Report"
                            onClick={() => handleDelete(report.id)}
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No reports found matching filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">
                Showing {indexOfFirstItem + 1} to{" "}
                {Math.min(indexOfLastItem, filteredReports.length)} of{" "}
                {filteredReports.length} entries
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="rounded-lg h-8 px-3"
                >
                  Previous
                </Button>
                {Array.from({ length: totalPages }, (_, idx) => (
                  <Button
                    key={idx + 1}
                    variant={currentPage === idx + 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(idx + 1)}
                    className="rounded-lg h-8 w-8 p-0"
                  >
                    {idx + 1}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="rounded-lg h-8 px-3"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden Print Container for Bulk Export */}
      <div id="bulk-round-print-pdf-container" style={{ display: "none" }}>
        {bulkRoundDetails.map((report) => {
          const clientName = report.clientId
            ? clients.find((c) => c.id == report.clientId)?.name ||
            `Client #${report.clientId}`
            : "N/A";
          const formatDateToDMY = (dateStr) => {
            if (!dateStr) return "DD/MM/YY";
            try {
              const d = new Date(dateStr);
              if (isNaN(d.getTime())) {
                return dateStr.replace(/-/g, "/");
              }
              const day = d.getDate().toString().padStart(2, "0");
              const month = (d.getMonth() + 1).toString().padStart(2, "0");
              const year = d.getFullYear().toString().slice(-2);
              return `${day}/${month}/${year}`;
            } catch (e) {
              return dateStr;
            }
          };
          const formattedReportId = `${clientName}-${report.unit}-ONR-${formatDateToDMY(report.visitDate)}`;

          const getAnswerColor = (ans) => {
            const norm = (ans || "").toLowerCase().trim();
            if (
              norm === "good" ||
              norm === "serviceable" ||
              norm === "adequate" ||
              norm === "yes"
            ) {
              return "text-emerald-600 font-bold";
            }
            if (norm === "action taken") {
              return "text-blue-600 font-bold";
            }
            if (
              norm === "not available" ||
              norm === "no" ||
              norm === "expired"
            ) {
              return "text-rose-600 font-bold";
            }
            return "text-slate-900 dark:text-slate-100 font-bold";
          };

          const checklistPhotos = (report.checklist || []).reduce((acc, q) => {
            if (q.photos && q.photos.length > 0) {
              acc.push(...q.photos);
            } else if (q.photo) {
              acc.push(q.photo);
            }
            return acc;
          }, []);

          const obsPhotosList = (report.observations || []).reduce(
            (acc, obs) => {
              if (obs.photos && obs.photos.length > 0) {
                acc.push(...obs.photos);
              }
              return acc;
            },
            [],
          );

          const allPhotos = Array.from(
            new Set([
              ...(report.photos || []),
              ...checklistPhotos,
              ...obsPhotosList,
            ]),
          );

          return (
            <div
              key={report.id}
              className="bg-white dark:bg-card text-slate-800 dark:text-slate-200 mx-auto mb-8 border border-slate-200 dark:border-slate-800"
              style={{
                pageBreakAfter: "always",
                width: "800px",
                minWidth: "800px",
                padding: "40px",
                boxSizing: "border-box",
              }}
            >
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                  .page-break-inside-avoid {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                  }
                `,
                }}
              />
              {/* PDF Header */}
              <div className="flex justify-between items-center border-b-2 border-[#1e3a8a] pb-6 mb-6 page-break-inside-avoid">
                <div className="flex items-center gap-3">
                  <div className="shrink-0">
                    <svg
                      width="70"
                      height="30"
                      viewBox="0 0 100 40"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M 5 12 L 35 12 L 30 17 L 35 22 L 5 22 Z"
                        fill="#1A1A1A"
                      />
                      <path
                        d="M 5 22 L 35 22 L 32 26 L 35 30 L 5 30 Z"
                        fill="#E53E3E"
                      />
                      <circle cx="10" cy="17" r="1.5" fill="white" />
                      <circle cx="20" cy="17" r="1.5" fill="white" />
                      <circle cx="30" cy="17" r="1.5" fill="white" />
                      <path
                        d="M 95 12 L 65 12 L 70 17 L 65 22 L 95 22 Z"
                        fill="#1A1A1A"
                      />
                      <path
                        d="M 95 22 L 65 22 L 68 26 L 65 30 L 95 30 Z"
                        fill="#E53E3E"
                      />
                      <circle cx="90" cy="17" r="1.5" fill="white" />
                      <circle cx="80" cy="17" r="1.5" fill="white" />
                      <circle cx="70" cy="17" r="1.5" fill="white" />
                      <polygon
                        points="50,2 54,16 68,16 57,25 61,38 50,30 39,38 43,25 32,16 46,16"
                        fill="#00D2FF"
                      />
                      <circle cx="50" cy="21" r="7" fill="#00A3C4" />
                      <text
                        x="50"
                        y="25"
                        fontFamily="sans-serif"
                        fontWeight="900"
                        fontSize="11"
                        fill="white"
                        textAnchor="middle"
                      >
                        U
                      </text>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100 leading-none">
                      Unique Delta Force Security Pvt. Ltd.
                    </h2>
                  </div>
                </div>
                <div className="text-center max-w-[40%]">
                  <h3 className="text-xs font-black text-[#1e3a8a] uppercase tracking-wider border-b-2 border-[#1e3a8a] pb-1">
                    FIELD OFFICER NIGHT VISIT REPORT
                  </h3>
                </div>
                <div className="text-right max-w-[30%] pr-2">
                  <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase block">
                    Report ID
                  </span>
                  <span className="text-[10px] font-black text-blue-600 tracking-tight block max-w-[180px] break-all">
                    {formattedReportId}
                  </span>
                </div>
              </div>

              {/* General Information Block */}
              <div className="mb-6 page-break-inside-avoid">
                <RibbonHeader title="General Information" />
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-card grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 shadow-sm text-xs text-left">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Client
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block mb-1">
                      {clientName}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Unit / Site
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {report.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Inspection Date
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {report.visitDate}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Visit Type
                    </span>
                    <span
                      className={`font-bold ${report.visitType === "Surprise" ? "text-rose-600" : "text-blue-600"}`}
                    >
                      {report.visitType}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Shift
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {report.shift || "Morning"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Start Time
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {formatTo12Hour(report.startTime)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      End Time
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {formatTo12Hour(report.endTime)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Officer Name
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {report.officer}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block flex items-center gap-0.5">
                      <MapPin className="h-3 w-3 text-blue-600" /> GPS Location
                    </span>
                    <span
                      className="font-bold text-slate-900 dark:text-slate-100 truncate block"
                      title={report.gps}
                    >
                      {report.gps || "N/A"}
                    </span>
                  </div>
                  <div className="col-span-4">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Uploaded Photos
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {allPhotos.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Guards Present Section */}
              {report.guards && report.guards.filter((g) => g.present).length > 0 && (
                <div className="mb-8 page-break-inside-avoid">
                  <div className="border-t-[3px] border-blue-900 pt-4 mb-4">
                    <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                      Guards Present on Duty
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-slate-400 dark:border-slate-600 text-xs">
                      <thead>
                        <tr className="bg-slate-200 dark:bg-slate-800 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-bold">
                          <th className="p-2 border border-slate-400 dark:border-slate-600 text-center w-[50px]">
                            Sr No
                          </th>
                          <th className="p-2 border border-slate-400 dark:border-slate-600">
                            Guard Name
                          </th>
                          <th className="p-2 border border-slate-400 dark:border-slate-600">
                            Employee ID / ID
                          </th>
                          <th className="p-2 border border-slate-400 dark:border-slate-600 text-center w-28">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.guards
                          .filter((g) => g.present)
                          .map((guard, idx) => (
                            <tr key={guard.id || idx} className="border border-slate-400 dark:border-slate-600">
                              <td className="p-2 border border-slate-400 dark:border-slate-600 text-center text-slate-800 dark:text-slate-200 font-medium">
                                {idx + 1}
                              </td>
                              <td className="p-2 border border-slate-400 dark:border-slate-600 font-semibold text-slate-900 dark:text-slate-100">
                                {guard.name}
                              </td>
                              <td className="p-2 border border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-200">
                                {guard.employeeId}
                              </td>
                              <td className="p-2 border border-slate-400 dark:border-slate-600 text-center">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Present
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Inspection Checklist Table */}
              <div className="mb-6 page-break-inside-avoid">
                <RibbonHeader title="2. Inspection Checklist" />
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-card shadow-sm text-xs">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b text-left text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                        <th className="p-3 pl-4 w-12">#</th>
                        <th className="p-3">Inspection Item</th>
                        <th className="p-3 w-32">Answer</th>
                        <th className="p-3 pr-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.checklist && report.checklist.length > 0 ? (
                        report.checklist.map((q, idx) => (
                          <tr
                            key={q.id}
                            className="border-b last:border-0 hover:bg-slate-50 dark:bg-slate-900/50/50"
                          >
                            <td className="p-3 pl-4 font-semibold text-slate-400 dark:text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                              {q.question}
                            </td>
                            <td className="p-3">
                              <span className={getAnswerColor(q.answer)}>
                                {q.answer || "N/A"}
                              </span>
                            </td>
                            <td className="p-3 pr-4 text-slate-500 dark:text-slate-400 dark:text-slate-500 italic font-medium">
                              {q.remarks || "All good"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-muted-foreground italic"
                          >
                            No checklist items.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Photo Evidence Section */}
              {allPhotos.length > 0 && (
                <div className="mb-6 page-break-inside-avoid">
                  <RibbonHeader title="3. Photo Evidence" />
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-card shadow-sm">
                    <div className="grid grid-cols-4 gap-4">
                      {allPhotos.map((photo, pIdx) => (
                        <div
                          key={pIdx}
                          className="aspect-square rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center"
                        >
                          <img
                            src={photo}
                            alt={`Evidence ${pIdx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Short Lecture & Random Checking side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 page-break-inside-avoid">
                <div className="flex flex-col">
                  <RibbonHeader title="4. Short Lecture" />
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-card flex-1 shadow-sm text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line min-h-[100px] text-left">
                    {report.lectureDetails ||
                      "Briefed staff about safety protocols, emergency response procedures and incident reporting."}
                  </div>
                </div>
                <div className="flex flex-col">
                  <RibbonHeader title="5. Random Checking" />
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-card flex-1 shadow-sm text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line min-h-[100px] text-left">
                    {report.randomChecking ||
                      "ID cards and attendance checked. No irregularities found."}
                  </div>
                </div>
              </div>

              {/* Suggestions Panel */}
              <div className="mb-8 page-break-inside-avoid">
                <RibbonHeader title="6. Suggestions" />
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-card shadow-sm text-xs text-slate-600 dark:text-slate-300 text-left">
                  {report.suggestions ? (
                    <ul className="list-disc pl-5 space-y-1.5">
                      {report.suggestions
                        .split("\n")
                        .filter((s) => s.trim())
                        .map((s, sIdx) => (
                          <li key={sIdx}>{s}</li>
                        ))}
                    </ul>
                  ) : (
                    <ul className="list-disc pl-5 space-y-1.5">
                      <li>Ensure proper maintenance of fire equipment.</li>
                      <li>Keep ambulance available during all shifts.</li>
                      <li>Regular inspection of water pumping system.</li>
                    </ul>
                  )}
                </div>
              </div>

              {/* Footer Block */}
              <div className="page-break-inside-avoid">
                {/* Date and Time Footer Block */}
                <div className="flex flex-col items-end justify-end pt-6 border-t text-right mb-6">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                    Date & Time
                  </span>
                  <span className="text-xs font-black text-slate-900 dark:text-slate-100 mt-0.5">
                    {report.visitDate}, {formatTo12Hour(report.endTime)}
                  </span>
                </div>

                {/* Footer Meta */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                  <span>
                    Generated by Unique Delta Force Security Pvt. Ltd.
                    Inspection System
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}