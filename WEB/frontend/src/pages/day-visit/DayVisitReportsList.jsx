import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  Edit,
  FileText,
  Trash2,
  Plus,
  Search,
  RotateCcw,
  ClipboardList,
  Loader2,
  MapPin,
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
import api from "../../services/api";
import {
  getStoredVisitReports,
  saveStoredVisitReports,
} from "../night-visit/mockData";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import JSZip from "jszip";
// @ts-ignore
import html2pdf from "html2pdf.js";

const formatTo12Hour = (time24) => {
  if (!time24) return "N/A";
  return time24;
};

export default function DayVisitReportsList() {
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
  const [selectedVisitIds, setSelectedVisitIds] = useState([]);
  const [bulkVisitDetails, setBulkVisitDetails] = useState([]);
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
      const res = await api.get("/officer-visits/reports");
      setReports(res.data || []);
    } catch (err) {
      console.error(
        "Failed to fetch visit reports, falling back to localStorage:",
        err,
      );
      setReports(getStoredVisitReports());
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
    const uniqueOfficers = Array.from(
      new Set(reports.map((r) => r.officer).filter(Boolean)),
    );
    setOfficers(uniqueOfficers);
  }, [reports]);

  const handleDelete = async (id) => {
    if (
      window.confirm(
        "Are you sure you want to delete this day visit report?",
      )
    ) {
      try {
        await api.delete(`/officer-visits/reports/${id}`);
        fetchReports();
      } catch (err) {
        console.error(
          "Failed to delete report from API, falling back to localStorage:",
          err,
        );
        const updated = reports.filter((r) => r.id !== id);
        saveStoredVisitReports(updated);
        setReports(updated);
      }
    }
  };

  const handleDownloadPDF = (reportId) => {
    navigate(`/officer-visit/preview/${reportId}`);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const pageIds = paginatedReports.map((item) => item.id);
      setSelectedVisitIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIds = paginatedReports.map((item) => item.id);
      setSelectedVisitIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    }
  };

  const handleSelectRow = (id, checked) => {
    if (checked) {
      setSelectedVisitIds((prev) => [...prev, id]);
    } else {
      setSelectedVisitIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const fetchAllSelectedVisitDetails = async () => {
    setBulkExporting(true);
    const toastId = toast.loading(
      `Fetching details for ${selectedVisitIds.length} visit report(s)...`,
    );
    try {
      const details = await Promise.all(
        selectedVisitIds.map(async (id) => {
          const resp = await api.get(`/officer-visits/reports/${id}`);
          return resp.data;
        }),
      );
      toast.success("Visit report details loaded successfully.", {
        id: toastId,
      });
      return details;
    } catch (err) {
      toast.error("Failed to load details for one or more visit reports.", {
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
    if (selectedVisitIds.length === 0) {
      alert("Please select at least one report to download.");
      return;
    }
    try {
      const details = await fetchAllSelectedVisitDetails();
      if (!details || details.length === 0) return;

      const toastId = toast.loading(
        `Generating separate PDFs for ${details.length} visit report(s)...`,
      );

      // Render selected reports into DOM printable container
      setBulkVisitDetails(details);

      // Wait for React to complete rendering
      await new Promise((resolve) => setTimeout(resolve, 600));

      const container = document.getElementById(
        "bulk-visit-print-pdf-container",
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
        const reportId = `${clientName}-${detail.unit}-ODV-${formatDateToDMY(detail.visitDate)}`;
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
      setBulkVisitDetails([]);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `Bulk_Officer_Visit_Reports_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      toast.success(
        "Bulk PDF reports downloaded successfully as a ZIP archive.",
        { id: toastId },
      );
      setSelectedVisitIds([]);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate bulk PDF reports.");
      setBulkVisitDetails([]);
    }
  };

  const getFormattedReportId = (report, index = 0) => {
    if (report.reportNo) return report.reportNo;
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
    const siteVisits = reports
      .filter((r) => r.siteId === report.siteId)
      .sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));
    const idx = siteVisits.findIndex(r => r.id === report.id);
    const countStr = String(idx !== -1 ? idx + 1 : 1).padStart(2, '0');
    return `${countStr}-${clientName}-${report.unit}-ODV-${formatDateToDMY(report.visitDate)}`;
  };

  const handleResetFilters = () => {
    setSearch("");
    setClientFilter("all");
    setBranchFilter("all");
    setSiteFilter("all");
    setOfficerFilter("all");
    setDateRangeType("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  // Filter reports
  const filteredReports = reports
    .filter((r) => {
      const matchesSearch =
        (r.reportNo || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.unit || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.officer || "").toLowerCase().includes(search.toLowerCase());

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
      if (r.visitDate) {
        const reportDate = new Date(r.visitDate);
        if (!isNaN(reportDate.getTime())) {
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
              const start = new Date(startDate);
              start.setHours(0, 0, 0, 0);
              if (reportDate.getTime() < start.getTime()) matchesDate = false;
            }
            if (endDate) {
              const end = new Date(endDate);
              end.setHours(0, 0, 0, 0);
              if (reportDate.getTime() > end.getTime()) matchesDate = false;
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
    })
    .sort((a, b) => {
      const dateA = a.createdOn
        ? new Date(a.createdOn).getTime()
        : a.visitDate
          ? new Date(a.visitDate).getTime()
          : 0;
      const dateB = b.createdOn
        ? new Date(b.createdOn).getTime()
        : b.visitDate
          ? new Date(b.visitDate).getTime()
          : 0;
      return dateB - dateA;
    });

  // Pagination logic
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-600" /> Day Visit
            Reports
          </h1>
        </div>
        <Button
          onClick={() => navigate("/officer-visit/create")}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 shadow-sm font-semibold text-xs"
        >
          <Plus className="h-4 w-4" /> Create Visit Report
        </Button>
      </div>

      {/* Filter Options */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm">
        <CardContent className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search report no, site, or officer..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 border-border rounded-lg h-9 text-xs"
              />
            </div>

            <Select
              value={clientFilter}
              onValueChange={(val) => {
                setClientFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="border-border rounded-lg h-9 text-xs">
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
              <SelectTrigger className="border-border rounded-lg h-9 text-xs">
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
              <SelectTrigger className="border-border rounded-lg h-9 text-xs">
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

            {/* Officer */}
            <Select
              value={officerFilter}
              onValueChange={(val) => {
                setOfficerFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="border-border rounded-lg h-9 text-xs">
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
              <SelectTrigger className="border-border rounded-lg h-9 text-xs">
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
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/50">
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
                  className="border-border rounded-lg h-9 text-xs w-full bg-background text-foreground"
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
                  className="border-border rounded-lg h-9 text-xs w-full bg-background text-foreground"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleResetFilters}
              variant="outline"
              size="sm"
              className="h-8 rounded-lg flex items-center gap-1.5 text-muted-foreground font-semibold text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between bg-muted/90 dark:bg-slate-900/90 border border-border rounded-lg p-3 mb-4 sticky top-[64px] z-30 shadow-md backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-200">
        <span className="text-xs font-semibold text-muted-foreground">
          {selectedVisitIds.length} report(s) selected
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={bulkExporting || selectedVisitIds.length === 0}
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
          {selectedVisitIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkExporting}
              className="h-8 text-xs font-semibold hover:bg-muted"
              onClick={() => setSelectedVisitIds([])}
            >
              Clear Selection
            </Button>
          )}
        </div>
      </div>

      {/* Reports Table */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-muted/50 border-b border-border">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center pl-6">
                    <Checkbox
                      checked={
                        paginatedReports.length > 0 &&
                        paginatedReports.every((item) =>
                          selectedVisitIds.includes(item.id),
                        )
                      }
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200 py-3">
                    Report ID
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200 py-3">
                    Site
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200 py-3">
                    Officer
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200 py-3">
                    Visit Date
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200 py-3">
                    Created On
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200 py-3">
                    Status
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200 py-3 pr-6 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedReports.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-muted-foreground italic"
                    >
                      No visit reports found matching the filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedReports.map((report, index) => (
                    <TableRow
                      key={report.id}
                      onClick={() =>
                        navigate(`/officer-visit/preview/${report.id}`)
                      }
                      className="hover:bg-muted/30 border-b border-border transition-colors cursor-pointer"
                    >
                      <TableCell className="w-12 text-center pl-6" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedVisitIds.includes(report.id)}
                          onCheckedChange={(checked) =>
                            handleSelectRow(report.id, !!checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-semibold text-foreground py-3 whitespace-normal break-words max-w-[220px] text-xs leading-normal">
                        {getFormattedReportId(report, index)}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground/90 py-3.5">
                        {report.unit}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-medium py-3.5">
                        {report.officer}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-medium py-3.5">
                        {report.visitDate}
                      </TableCell>
                      <TableCell className="text-muted-foreground/80 font-medium py-3.5">
                        {report.createdOn}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <Badge
                          className={
                            report.status === "Completed"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 font-bold px-2 py-0.5 rounded-full"
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 font-bold px-2 py-0.5 rounded-full"
                          }
                        >
                          {report.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3.5 pr-6 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          onClick={() =>
                            navigate(`/officer-visit/edit/${report.id}`)
                          }
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
                        >
                          <Edit className="h-4.5 w-4.5" />
                        </Button>
                        <Button
                          onClick={() => handleDelete(report.id)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 text-xs">
              <span className="text-muted-foreground">
                Showing Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg"
                >
                  Previous
                </Button>
                <Button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden Print Container for Bulk Export */}
      <div id="bulk-visit-print-pdf-container" style={{ display: "none" }}>
        {bulkVisitDetails.map((report) => {
          const clientName = report.clientId
            ? clients.find((c) => c.id == report.clientId)?.name ||
            `Client #${report.clientId}`
            : "N/A";
          let customerFeedbackText = "";
          let overallSuggestionsText = "";
          if (report.suggestions) {
            try {
              const parsed = JSON.parse(report.suggestions);
              if (parsed && typeof parsed === "object") {
                customerFeedbackText = parsed.customerFeedback || "";
                overallSuggestionsText = parsed.overallSuggestions || "";
              } else {
                overallSuggestionsText = report.suggestions;
              }
            } catch (e) {
              overallSuggestionsText = report.suggestions;
            }
          }

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
          const formattedReportId = `${clientName}-${report.unit}-ODV-${formatDateToDMY(report.visitDate)}`;

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

          const displayObservations = report.observations || [];

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
              className="bg-white dark:bg-card text-slate-800 dark:text-slate-200 mx-auto mb-8 border border-slate-200 dark:border-slate-800 text-sm"
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
                    FIELD OFFICER VISIT REPORT
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase block">
                    Report ID
                  </span>
                  <span className="text-[10px] font-black text-blue-600 tracking-tight block break-words">
                    {formattedReportId}
                  </span>
                </div>
              </div>

              {/* Header line */}
              <div className="border-t-[3px] border-blue-900 pt-4 mb-4 text-left page-break-inside-avoid">
                <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                  General Information
                </div>
              </div>

              {/* Info Box */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50 dark:bg-slate-900/50/50 mb-8 grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-xs text-left page-break-inside-avoid">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Client
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm block">
                    {clientName}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Inspection Date
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm block">
                    {report.visitDate}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Visit Type
                  </span>
                  <span className="text-blue-600 font-bold text-sm block">
                    {report.visitType || "Scheduled"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Shift
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm block">
                    {report.shift || "Morning"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Unit / Site
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm block">
                    {report.unit || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Start Time
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm block">
                    {formatTo12Hour(report.startTime)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    End Time
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm block">
                    {formatTo12Hour(report.endTime)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-blue-600" /> GPS Location
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm block">
                    {report.gps || "N/A"}
                  </span>
                </div>
                <div className="col-span-2 md:col-span-4">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Uploaded Photos
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm block">
                    {allPhotos.length}
                  </span>
                </div>
              </div>

              {/* Pre-defined Checklist Section */}
              {report.checklist &&
                report.checklist.length > 0 &&
                report.checklist.some(
                  (c) => c.id && c.id.toString().startsWith("pq_"),
                ) && (
                  <div className="mb-8 page-break-inside-avoid">
                    <div className="border-t-[3px] border-blue-900 pt-4 mb-4 text-left">
                      <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                        A. Pre-defined Checklist Answers
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
                              Question
                            </th>
                            <th className="p-2 border border-slate-400 dark:border-slate-600 text-center w-28">
                              Status
                            </th>
                            <th className="p-2 border border-slate-400 dark:border-slate-600">
                              Remarks / Observations
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.checklist.map((c, idx) => (
                            <tr
                              key={c.id || idx}
                              className="border border-slate-400 dark:border-slate-600"
                            >
                              <td className="p-2 border border-slate-400 dark:border-slate-600 text-center text-slate-800 dark:text-slate-200 font-medium">
                                {idx + 1}
                              </td>
                              <td className="p-2 border border-slate-400 dark:border-slate-600 font-semibold text-slate-900 dark:text-slate-100">
                                {c.question}
                              </td>
                              <td className="p-2 border border-slate-400 dark:border-slate-600 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.status === "Satisfactory"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : c.status === "Unsatisfactory"
                                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
                                    }`}
                                >
                                  {c.status}
                                </span>
                              </td>
                              <td className="p-2 border border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-200">
                                {c.observation || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Detailed Observations Log */}
              {displayObservations && displayObservations.length > 0 && (
                <div className="mb-8 page-break-inside-avoid">
                  <div className="border-t-[3px] border-blue-900 pt-4 mb-4 text-left">
                    <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                      B. Observations Log
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
                            Inspection Point
                          </th>
                          <th className="p-2 border border-slate-400 dark:border-slate-600">
                            Observation
                          </th>
                          <th className="p-2 border border-slate-400 dark:border-slate-600">
                            Action Required
                          </th>
                          <th className="p-2 border border-slate-400 dark:border-slate-600">
                            Action Done / Status
                          </th>
                          <th className="p-2 border border-slate-400 dark:border-slate-600">
                            Corrective Measures
                          </th>
                          <th className="p-2 border border-slate-400 dark:border-slate-600">
                            Remarks
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayObservations.map((obs, idx) => (
                          <tr
                            key={obs.id || idx}
                            className="border border-slate-400 dark:border-slate-600"
                          >
                            <td className="p-2 border border-slate-400 dark:border-slate-600 text-center text-slate-800 dark:text-slate-200 font-medium">
                              {idx + 1}
                            </td>
                            <td className="p-2 border border-slate-400 dark:border-slate-600 font-semibold text-slate-900 dark:text-slate-100">
                              {obs.actionPoint}
                            </td>
                            <td className="p-2 border border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-200">
                              {obs.observation || "N/A"}
                            </td>
                            <td className="p-2 border border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-200">
                              {obs.actionRequired || "N/A"}
                            </td>
                            <td className="p-2 border border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-200">
                              {obs.actionDone || "N/A"}
                            </td>
                            <td className="p-2 border border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-200">
                              {obs.correctiveMeasures || "N/A"}
                            </td>
                            <td className="p-2 border border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-200">
                              {obs.remarks || "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Photo Evidence Gallery */}
              {allPhotos.length > 0 && (
                <div className="mb-8 page-break-inside-avoid">
                  <div className="border-t-[3px] border-blue-900 pt-4 mb-4 text-left">
                    <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md mb-4">
                      C. Photo Evidence Gallery
                    </div>
                  </div>
                  <div className="border border-slate-300 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-900/50/50 shadow-inner">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {allPhotos.map((photo, pIdx) => (
                        <div
                          key={pIdx}
                          className="aspect-square rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-card flex items-center justify-center shadow-sm"
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

              {/* Client Feedback & Suggestions Block */}
              {(customerFeedbackText || overallSuggestionsText) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-left page-break-inside-avoid">
                  {customerFeedbackText && (
                    <div className="flex flex-col">
                      <div className="border-t-[3px] border-blue-900 pt-4 mb-3">
                        <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md">
                          D. Client / Customer Feedback
                        </div>
                      </div>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-card shadow-sm flex-1 min-h-[90px] text-xs text-slate-700 dark:text-slate-200 italic">
                        "{customerFeedbackText}"
                      </div>
                    </div>
                  )}
                  {overallSuggestionsText && (
                    <div className="flex flex-col">
                      <div className="border-t-[3px] border-blue-900 pt-4 mb-3">
                        <div className="inline-block bg-[#1E3A8A] text-white text-[10px] font-bold px-4 py-1.5 uppercase tracking-wider rounded-r-md">
                          E. Overall Suggestions
                        </div>
                      </div>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-card shadow-sm flex-1 min-h-[90px] text-xs text-slate-700 dark:text-slate-200">
                        {overallSuggestionsText}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Block */}
              <div className="page-break-inside-avoid">
                {/* Date & Time block */}
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