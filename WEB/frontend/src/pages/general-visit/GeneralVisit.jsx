import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  PlusCircle,
  Building2,
  MapPin,
  Users,
  Search,
  BookOpen,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Eye,
  Download,
  Shield,
  Edit,
  Loader2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import api from "../../services/api";
// @ts-ignore
import html2pdf from "html2pdf.js";
import JSZip from "jszip";

export default function GeneralVisit() {
  const navigate = useNavigate();
  const [visits, setVisits] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [branches, setBranches] = useState([]);

  // Table Loading and Search State
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Filters State matching rounds & visits
  const [clientFilter, setClientFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [dateRangeType, setDateRangeType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Modal State for General Visit Form
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [personVisited, setPersonVisited] = useState("");
  const [reasonOfVisit, setReasonOfVisit] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [remark, setRemark] = useState("");
  const [officer, setOfficer] = useState("");
  const [visitType, setVisitType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Selection and Bulk Actions State
  const [selectedVisitIds, setSelectedVisitIds] = useState([]);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkVisitDetails, setBulkVisitDetails] = useState([]);

  // Load General Visits and filters options
  const loadData = async () => {
    setLoading(true);
    try {
      const visitsRes = await api.get("/general-visits");
      setVisits(visitsRes.data || []);

      const clientsRes = await api.get("/assessments/clients");
      setClients(clientsRes.data || []);

      const sitesRes = await api.get("/assessments/sites");
      setSites(sitesRes.data || []);

      const branchesRes = await api.get("/assessments/branches");
      setBranches(branchesRes.data || []);
    } catch (error) {
      console.error("Failed to load general visits data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Prefill fields from dashboard sudden visit modal if query parameters are provided
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("open") === "true") {
      setIsOpen(true);
      const pClientId = urlParams.get("clientId");
      const pSiteId = urlParams.get("siteId");
      const pDate = urlParams.get("date");
      const pRemark = urlParams.get("remark");
      if (pClientId) setSelectedClientId(pClientId);
      if (pSiteId) setSelectedSiteId(pSiteId);
      if (pDate) setVisitDate(pDate);
      else setVisitDate(new Date().toISOString().split("T")[0]);
      if (pRemark) setRemark(decodeURIComponent(pRemark));
    } else {
      setVisitDate(new Date().toISOString().split("T")[0]);
    }
  }, []);

  // Fetch sites when client changes inside modal
  useEffect(() => {
    const loadSites = async () => {
      if (selectedClientId) {
        try {
          const sitesRes = await api.get(`/assessments/sites?company_id=${selectedClientId}&all_sites=true`);
          setSites(sitesRes.data || []);
        } catch (error) {
          console.error("Failed to load sites", error);
        }
      } else {
        // Fallback to loading all sites
        try {
          const sitesRes = await api.get("/assessments/sites");
          setSites(sitesRes.data || []);
        } catch (error) {}
      }
    };
    loadSites();
  }, [selectedClientId]);

  // Form close handler
  const handleClose = (openState) => {
    if (!openState) {
      setIsOpen(false);
      setEditId(null);
      setSelectedClientId("");
      setSelectedSiteId("");
      setPersonVisited("");
      setReasonOfVisit("");
      setVisitDate(new Date().toISOString().split("T")[0]);
      setStartTime("");
      setEndTime("");
      setRemark("");
      setOfficer("");
      setVisitType("");
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("open") === "true") {
        navigate(-1);
      }
    } else {
      setIsOpen(true);
    }
  };

  // Helper to format report ID
  const getFormattedReportId = (v, index = 0) => {
    const formatDateToDMY = (dateStr) => {
      if (!dateStr) return "DD/MM/YY";
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime()))
          return dateStr.replace(/-/g, "/");
        return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear().toString().slice(-2)}`;
      } catch {
        return dateStr;
      }
    };
    const siteVisits = visits
      .filter((visit) => visit.siteId === v.siteId)
      .sort((a, b) => (a.created_on || a.createdOn || 0) - (b.created_on || b.createdOn || 0));
    const siteIndex = siteVisits.findIndex((visit) => visit.id === v.id);
    const countStr = String(siteIndex !== -1 ? siteIndex + 1 : 1).padStart(2, '0');
    return `${countStr}-${v.clientName || 'N/A'}-${v.siteName || 'N/A'}-OGV-${formatDateToDMY(v.visitDate || v.createdOn)}`;
  };

  // Handle Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientId || !selectedSiteId || !personVisited.trim() || !reasonOfVisit.trim() || !visitDate) {
      alert("All fields are mandatory.");
      return;
    }

    setSubmitting(true);
    try {
      const clientName = clients.find((c) => c.id.toString() === selectedClientId)?.name || "";
      const siteName = sites.find((s) => s.id.toString() === selectedSiteId)?.name || "";

      const payload = {
        id: editId || `gv-${Date.now()}`,
        clientId: parseInt(selectedClientId, 10),
        clientName,
        siteId: parseInt(selectedSiteId, 10),
        siteName,
        personVisited: personVisited.trim(),
        reasonOfVisit: reasonOfVisit.trim(),
        visitDate,
        startTime,
        endTime,
        remark: remark.trim(),
        officer: officer.trim(),
        visitType: visitType,
        created_on: Date.now(),
      };

      await api.post("/general-visits", payload);

      // Reset state and close modal
      setSelectedClientId("");
      setSelectedSiteId("");
      setPersonVisited("");
      setReasonOfVisit("");
      setVisitDate(new Date().toISOString().split("T")[0]);
      setStartTime("");
      setEndTime("");
      setRemark("");
      setOfficer("");
      setVisitType("");
      setIsOpen(false);
      setEditId(null);

      toast.success(editId ? "General Visit updated successfully!" : "General Visit logged successfully!");

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("open") === "true") {
        navigate(-1);
      } else {
        loadData();
      }
    } catch (error) {
      console.error("Failed to save general visit", error);
      alert("Error saving general visit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Trigger inline Edit
  const handleEdit = (v) => {
    setEditId(v.id);
    setSelectedClientId(v.clientId.toString());
    setSelectedSiteId(v.siteId.toString());
    setPersonVisited(v.personVisited);
    setReasonOfVisit(v.reasonOfVisit);
    setVisitDate(v.visitDate || new Date().toISOString().split("T")[0]);
    setStartTime(v.startTime || "");
    setEndTime(v.endTime || "");
    setRemark(v.remark || "");
    setOfficer(v.officer || "");
    setVisitType(v.visitType || "");
    setIsOpen(true);
  };

  // Handle Delete Visit
  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this general visit record?")) {
      try {
        await api.delete(`/general-visits/${id}`);
        toast.success("General Visit deleted successfully.");
        loadData();
      } catch (error) {
        console.error("Failed to delete general visit", error);
        alert("Failed to delete record.");
      }
    }
  };

  // Row Selection logic
  const handleSelectRow = (id, checked) => {
    if (checked) {
      setSelectedVisitIds((prev) => [...prev, id]);
    } else {
      setSelectedVisitIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = filteredVisits.map((item) => item.id);
      setSelectedVisitIds(allIds);
    } else {
      setSelectedVisitIds([]);
    }
  };

  // Bulk PDF Export
  const handleBulkExportPDF = async () => {
    if (clientFilter === "all") {
      alert("Please select a specific client first to download bulk PDFs.");
      return;
    }
    if (selectedVisitIds.length === 0) {
      alert("Please select at least one report to download.");
      return;
    }
    setBulkExporting(true);
    const toastId = toast.loading(`Generating separate PDFs for ${selectedVisitIds.length} general visit report(s)...`);
    try {
      const details = visits.filter((v) => selectedVisitIds.includes(v.id));
      setBulkVisitDetails(details);

      // Wait for rendering
      await new Promise((resolve) => setTimeout(resolve, 800));

      const container = document.getElementById("bulk-general-print-container");
      if (!container) {
        throw new Error("Print container not found in DOM");
      }

      // Display off-screen
      const originalDisplay = container.style.display;
      container.style.display = "block";
      container.style.position = "absolute";
      container.style.left = "20000px";
      container.style.top = "0";

      const reportElements = Array.from(container.children).filter((el) => el.tagName === "DIV");
      const zip = new JSZip();
      const options = {
        margin: 10,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      };

      for (let i = 0; i < reportElements.length; i++) {
        const detail = details[i];
        const reportId = getFormattedReportId(detail, i);
        const filename = `${reportId.replace(/\//g, "-")}.pdf`;

        const element = reportElements[i];
        const blob = await html2pdf().set(options).from(element).toPdf().outputPdf("blob");
        zip.file(filename, blob);

        toast.loading(`Generated ${i + 1} of ${details.length} PDFs...`, { id: toastId });
      }

      container.style.display = originalDisplay;
      setBulkVisitDetails([]);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `Bulk_General_Visit_Reports_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      toast.success("Bulk PDF reports downloaded successfully as a ZIP archive.", { id: toastId });
      setSelectedVisitIds([]);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate bulk PDF reports.", { id: toastId });
      setBulkVisitDetails([]);
    } finally {
      setBulkExporting(false);
    }
  };

  // Filtered visits list
  const filteredVisits = visits.filter((v) => {
    // 1. Search filter
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      v.clientName?.toLowerCase().includes(term) ||
      v.siteName?.toLowerCase().includes(term) ||
      v.personVisited?.toLowerCase().includes(term) ||
      v.reasonOfVisit?.toLowerCase().includes(term);

    if (!matchesSearch) return false;

    // 2. Client filter
    if (clientFilter !== "all" && String(v.clientId) !== clientFilter) {
      return false;
    }

    // 3. Branch filter
    if (branchFilter !== "all") {
      const siteObj = sites.find((s) => s.id == v.siteId || s.name === v.siteName);
      const matchesBranch = siteObj && String(siteObj.BRANCH) === branchFilter;
      if (!matchesBranch) return false;
    }

    // 4. Site filter
    if (siteFilter !== "all" && String(v.siteId) !== siteFilter) {
      return false;
    }

    // 5. Date Range filter
    if (dateRangeType !== "all") {
      const vDate = new Date(v.visitDate || v.createdOn);
      vDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateRangeType === "today") {
        if (vDate.getTime() !== today.getTime()) return false;
      } else if (dateRangeType === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (vDate.getTime() !== yesterday.getTime()) return false;
      } else if (dateRangeType === "week") {
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        if (vDate < lastWeek) return false;
      } else if (dateRangeType === "custom") {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);

        if (start && vDate < start) return false;
        if (end && vDate > end) return false;
      }
    }

    return true;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredVisits.length / itemsPerPage);
  const paginatedVisits = filteredVisits.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 text-sm">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="h-5.5 w-5.5 text-blue-600" /> Officer General Visit Logs
          </h1>
        </div>
        <Button
          onClick={() => {
            setSelectedClientId("");
            setSelectedSiteId("");
            setPersonVisited("");
            setReasonOfVisit("");
            setVisitDate(new Date().toISOString().split("T")[0]);
            setStartTime("");
            setEndTime("");
            setRemark("");
            setEditId(null);
            setIsOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 h-10 px-4 font-semibold text-xs shrink-0 self-start sm:self-auto"
        >
          <PlusCircle className="h-4.5 w-4.5" /> Log General Visit
        </Button>
      </div>

      {/* gray Selection Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 border border-border p-3.5 rounded-xl text-xs font-semibold text-muted-foreground">
        <div>{selectedVisitIds.length} report(s) selected</div>
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

      {/* Main List Table Card */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="border-b pb-4 px-6 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-sm font-bold text-foreground">
              General Visits Registry
            </CardTitle>
          </div>

          {/* Filters Bar matching rounds */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search visits..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-4 h-9 text-xs rounded-lg w-full bg-background"
              />
            </div>

            <Select
              value={clientFilter}
              onValueChange={(val) => {
                setClientFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg w-full">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent className="text-xs">
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
              <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg w-full">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent className="text-xs">
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
              <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg w-full">
                <SelectValue placeholder="All Sites" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={dateRangeType}
              onValueChange={(val) => {
                setDateRangeType(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg w-full">
                <SelectValue placeholder="All Dates" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="custom">Custom Date Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Inputs if Custom is selected */}
          {dateRangeType === "custom" && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed border-border">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Range:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 text-xs w-36 bg-background"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 text-xs w-36 bg-background"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-muted/30 border-b border-border">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center pl-6">
                    <Checkbox
                      checked={
                        paginatedVisits.length > 0 &&
                        paginatedVisits.every((item) =>
                          selectedVisitIds.includes(item.id)
                        )
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Report ID</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Date Logged</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Client / Company</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Site Location</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Person Visited</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Reason of Visit</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200 pr-6 w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading general visits...
                    </TableCell>
                  </TableRow>
                ) : paginatedVisits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground italic">
                      No general visits logged. Click "Log General Visit" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedVisits.map((v, index) => {
                    const globalIndex = (currentPage - 1) * itemsPerPage + index;
                    return (
                      <TableRow 
                        key={v.id} 
                        className="hover:bg-muted/10 cursor-pointer"
                        onClick={() => navigate(`/general-visits/preview/${v.id}`)}
                      >
                        <TableCell className="w-12 text-center pl-6" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedVisitIds.includes(v.id)}
                            onCheckedChange={(checked) => handleSelectRow(v.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell className="font-bold text-foreground break-all max-w-[200px]">
                          {getFormattedReportId(v, globalIndex)}
                        </TableCell>
                        <TableCell className="font-semibold text-foreground whitespace-nowrap">
                          {v.createdOn}
                        </TableCell>
                        <TableCell className="font-medium text-foreground whitespace-nowrap">
                          {v.clientName}
                        </TableCell>
                        <TableCell className="font-medium text-foreground whitespace-nowrap">
                          {v.siteName}
                        </TableCell>
                        <TableCell className="text-slate-800 dark:text-slate-200">
                          {v.personVisited}
                        </TableCell>
                        <TableCell className="text-slate-800 dark:text-slate-200 max-w-sm truncate" title={v.reasonOfVisit}>
                          {v.reasonOfVisit}
                        </TableCell>
                        <TableCell className="text-right pr-6 space-x-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(v)}
                            className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10 rounded-lg"
                            title="Edit Report"
                          >
                            <Edit className="h-4.5 w-4.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(v.id)}
                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-500/10 rounded-lg"
                            title="Delete Report"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/10 text-xs">
              <div className="text-muted-foreground">
                Showing Page {currentPage} of {totalPages} ({filteredVisits.length} total reports)
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Creation/Edit Modal dialog */}
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="rounded-xl border max-w-[500px] bg-card text-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" /> {editId ? "Edit General Visit" : "Log General Visit"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 py-2">
            {/* Client Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                Select Client <span className="text-rose-500">*</span>
              </label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg">
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Site Select */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                Select Site <span className="text-rose-500">*</span>
              </label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId} disabled={!selectedClientId}>
                <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg">
                  <SelectValue placeholder={selectedClientId ? "Choose a site..." : "Select client first..."} />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Input */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                Date <span className="text-rose-500">*</span>
              </label>
              <Input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="h-9 border-border bg-background text-foreground text-xs rounded-lg [&::-webkit-calendar-picker-indicator]:invert"
                required
              />
            </div>

            {/* Officer Name & Visit Type */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                  Officer Name
                </label>
                <Input
                  type="text"
                  placeholder="Officer name..."
                  value={officer}
                  onChange={(e) => setOfficer(e.target.value)}
                  className="h-9 border-border bg-background text-foreground text-xs rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                  Visit Type
                </label>
                <Select value={visitType} onValueChange={setVisitType}>
                  <SelectTrigger className="h-9 border-border bg-background text-foreground text-xs rounded-lg">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                    <SelectItem value="Sudden">Sudden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Start & End Time */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                  Start Time
                </label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-9 border-border bg-background text-foreground text-xs rounded-lg [&::-webkit-calendar-picker-indicator]:invert"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                  End Time
                </label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-9 border-border bg-background text-foreground text-xs rounded-lg [&::-webkit-calendar-picker-indicator]:invert"
                />
              </div>
            </div>

            {/* Person Visited Textarea */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                Person Visited <span className="text-rose-500">*</span>
              </label>
              <Textarea
                placeholder="Name or details of the person visited..."
                value={personVisited}
                onChange={(e) => setPersonVisited(e.target.value)}
                className="min-h-[50px] border-border text-xs rounded-lg bg-background text-foreground"
                required
              />
            </div>

            {/* Reason of Visit Textarea */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                Reason of Visit <span className="text-rose-500">*</span>
              </label>
              <Textarea
                placeholder="Reason or description of the visit..."
                value={reasonOfVisit}
                onChange={(e) => setReasonOfVisit(e.target.value)}
                className="min-h-[50px] border-border text-xs rounded-lg bg-background text-foreground"
                required
              />
            </div>

            {/* Remark Textarea */}
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300">
                Remark
              </label>
              <Textarea
                placeholder="Write remark or notes..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="min-h-[50px] border-border text-xs rounded-lg bg-background text-foreground"
              />
            </div>

            <DialogFooter className="gap-2 pt-2 border-t mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                className="h-9 text-xs rounded-lg font-medium"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-xs font-semibold rounded-lg"
              >
                {submitting ? "Saving..." : "Save Visit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Hidden container for generating bulk PDFs */}
      <div id="bulk-general-print-container" style={{ display: "none" }}>
        {bulkVisitDetails.map((report, i) => (
          <div key={report.id} className="p-8 bg-white text-black text-sm space-y-6" style={{ pageBreakAfter: "always" }}>
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-blue-800 pb-4 mb-4">
              <div>
                <h1 className="text-base font-bold uppercase text-slate-800">
                  Field Officer Management Portal
                </h1>
                <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                  Official General Audit Report
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-blue-800 uppercase font-mono">
                  REPORT TYPE: GENERAL VISIT
                </span>
              </div>
            </div>

            {/* Details Table */}
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <tbody>
                <tr className="border-b border-slate-300">
                  <td className="w-1/4 p-2 bg-slate-100 font-bold">Client / Company</td>
                  <td className="w-1/4 p-2">{report.clientName}</td>
                  <td className="w-1/4 p-2 bg-slate-100 font-bold">Site / Unit Location</td>
                  <td className="w-1/4 p-2">{report.siteName}</td>
                </tr>
                <tr className="border-b border-slate-300">
                  <td className="w-1/4 p-2 bg-slate-100 font-bold">Visit Date</td>
                  <td className="w-1/4 p-2">{report.visitDate}</td>
                  <td className="w-1/4 p-2 bg-slate-100 font-bold">Date Logged</td>
                  <td className="w-1/4 p-2">{report.createdOn}</td>
                </tr>
                <tr className="border-b border-slate-300">
                  <td className="w-1/4 p-2 bg-slate-100 font-bold">Start Time</td>
                  <td className="w-1/4 p-2">{report.startTime || "N/A"}</td>
                  <td className="w-1/4 p-2 bg-slate-100 font-bold">End Time</td>
                  <td className="w-1/4 p-2">{report.endTime || "N/A"}</td>
                </tr>
                <tr className="border-b border-slate-300">
                  <td className="w-1/4 p-2 bg-slate-100 font-bold">Person Visited</td>
                  <td className="w-3/4 p-2" colSpan={3}>{report.personVisited}</td>
                </tr>
                <tr>
                  <td className="w-1/4 p-2 bg-slate-100 font-bold">Reason of Visit</td>
                  <td className="w-3/4 p-2" colSpan={3}>{report.reasonOfVisit}</td>
                </tr>
              </tbody>
            </table>

            {report.remark && (
              <div className="space-y-1">
                <span className="block text-[10px] text-muted-foreground font-semibold">Remarks & Notes</span>
                <div className="p-3 border border-slate-300 bg-slate-50 italic text-xs">
                  {report.remark}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
