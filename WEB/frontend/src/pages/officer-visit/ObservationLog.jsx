import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Eye,
  Trash2,
  Upload,
  X,
  ClipboardList,
  FileCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "../../services/api";

export default function ObservationLog() {
  const navigate = useNavigate();
  const [observations, setObservations] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters and Sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClientFilter, setSelectedClientFilter] = useState("all");
  const [selectedSiteFilter, setSelectedSiteFilter] = useState("all");
  const [dateSort, setDateSort] = useState("newest");

  // Selection state
  const [selectedObsIds, setSelectedObsIds] = useState([]);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedObs, setSelectedObs] = useState(null);

  // Form state
  const [formClient, setFormClient] = useState("none");
  const [formSite, setFormSite] = useState("none");
  const [actionPoint, setActionPoint] = useState("");
  const [customActionPoint, setCustomActionPoint] = useState("");
  const [useCustomActionPoint, setUseCustomActionPoint] = useState(false);
  const [observation, setObservation] = useState("");
  const [actionRequired, setActionRequired] = useState("");
  const [actionDone, setActionDone] = useState("");
  const [correctiveMeasures, setCorrectiveMeasures] = useState("");
  const [remarks, setRemarks] = useState("");
  const [status, setStatus] = useState("Pending");
  const [photos, setPhotos] = useState([]);

  // Load observations, clients, and all sites on mount
  useEffect(() => {
    fetchObservations();
    loadClients();
    loadAllSites();
  }, []);

  const loadAllSites = async () => {
    try {
      const res = await api.get("/assessments/sites");
      setAllSites(res.data || []);
    } catch (err) {
      console.error("Failed to load all sites:", err);
    }
  };

  // Fetch observations
  const fetchObservations = async () => {
    setLoading(true);
    try {
      const res = await api.get("/officer-visits/observations");
      setObservations(res.data || []);
    } catch (err) {
      console.error("Failed to load observations:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load clients
  const loadClients = async () => {
    try {
      const res = await api.get("/assessments/clients");
      setClients(res.data || []);
    } catch (err) {
      console.error("Failed to load clients:", err);
    }
  };

  // Load sites when filter client changes
  const handleClientFilterChange = async (val) => {
    setSelectedClientFilter(val);
    setSelectedSiteFilter("all");
    if (val === "all") {
      setSites([]);
      return;
    }
    try {
      const res = await api.get(`/assessments/sites?company_id=${val}`);
      setSites(res.data || []);
    } catch (err) {
      console.error("Failed to load sites for filter:", err);
    }
  };

  // Load sites for the form when selected client changes
  useEffect(() => {
    const loadFormSites = async () => {
      if (formClient === "none" || formClient === "all") {
        setFormSite("none");
        setCheckpoints([]);
        return;
      }
      try {
        const res = await api.get(
          `/assessments/sites?company_id=${formClient}`,
        );
        setSites(res.data || []);
        // If there's an active site, auto-load checkpoints or set default site
        setCheckpoints([]);
      } catch (err) {
        console.error("Failed to load form sites:", err);
      }
    };
    loadFormSites();
  }, [formClient]);

  // Load checkpoints when form site changes
  useEffect(() => {
    const loadFormCheckpoints = async () => {
      if (formSite === "none") {
        setCheckpoints([]);
        return;
      }
      try {
        const res = await api.get(`/locations/checkpoints?site_id=${formSite}`);
        setCheckpoints(res.data || []);
      } catch (err) {
        console.error("Failed to load checkpoints:", err);
        setCheckpoints([]);
      }
    };
    loadFormCheckpoints();
  }, [formSite]);

  // Photo Upload Handler
  const handlePhotoUpload = (file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setPhotos((prev) => [...prev, base64String]);
    };
    reader.readAsDataURL(file);
  };

  // Remove Photo
  const handleRemovePhoto = (idx) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // Submit Observation
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!observation) {
      alert("Please provide the observation details.");
      return;
    }

    const finalActionPoint = useCustomActionPoint
      ? customActionPoint
      : actionPoint;
    if (!finalActionPoint) {
      alert("Please select or enter an Action Point.");
      return;
    }

    const payload = {
      id: `obs-${Date.now()}`,
      actionPoint: finalActionPoint,
      observation,
      actionRequired,
      actionDone,
      correctiveMeasures,
      remarks,
      status,
      photos,
      createdOn: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      clientId: formClient !== "none" ? parseInt(formClient) : undefined,
      siteId: formSite !== "none" ? parseInt(formSite) : undefined,
    };

    try {
      await api.post("/officer-visits/observations", payload);
      setIsAddOpen(false);
      resetForm();
      fetchObservations();
    } catch (err) {
      console.error("Failed to submit observation:", err);
      alert("Failed to submit observation. Please try again.");
    }
  };

  // Delete Observation
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (
      window.confirm(
        "Are you sure you want to delete this observation finding?",
      )
    ) {
      try {
        await api.delete(`/officer-visits/observations/${id}`);
        fetchObservations();
      } catch (err) {
        console.error("Failed to delete observation:", err);
      }
    }
  };

  // Selection Handlers
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedObsIds(filteredObservations.map((o) => o.id));
    } else {
      setSelectedObsIds([]);
    }
  };

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedObsIds((prev) => [...prev, id]);
    } else {
      setSelectedObsIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleCreateReport = async () => {
    if (selectedObsIds.length === 0) {
      alert("Please select at least one observation.");
      return;
    }
    try {
      const res = await api.post("/officer-visits/reports/from-observations", {
        observationIds: selectedObsIds,
      });
      if (res.data && res.data.reportId) {
        alert("Report generated successfully!");
        navigate(`/officer-visit/preview/${res.data.reportId}`);
      } else {
        alert("Failed to generate report. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate report:", err);
      alert("Error generating report. Please check selection.");
    }
  };

  const resetForm = () => {
    setFormClient("none");
    setFormSite("none");
    setActionPoint("");
    setCustomActionPoint("");
    setUseCustomActionPoint(false);
    setObservation("");
    setActionRequired("");
    setActionDone("");
    setCorrectiveMeasures("");
    setRemarks("");
    setStatus("Pending");
    setPhotos([]);
    setSelectedObsIds([]);
  };

  // Filtered observations
  const filteredObservations = observations.filter((o) => {
    const matchesSearch =
      (o.actionPoint || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.observation || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClient =
      selectedClientFilter === "all" ||
      o.clientId?.toString() === selectedClientFilter;
    const matchesSite =
      selectedSiteFilter === "all" ||
      o.siteId?.toString() === selectedSiteFilter;

    return matchesSearch && matchesClient && matchesSite;
  });

  // Sorted observations (Date wise)
  const sortedObservations = [...filteredObservations].sort((a, b) => {
    const timeA = new Date(a.createdOn || "").getTime();
    const timeB = new Date(b.createdOn || "").getTime();
    return dateSort === "newest" ? timeB - timeA : timeA - timeB;
  });

  return (
    <div className="space-y-6">
      {/* Header Block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-600" /> Observations Log
          </h1>
          <p className="text-muted-foreground text-sm">
            Review and manage security findings across the facility.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedObsIds.length > 0 && (
            <Button
              onClick={handleCreateReport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2 shadow-sm font-semibold text-xs h-9 px-3"
            >
              <FileCheck className="h-4 w-4" /> Create Report (
              {selectedObsIds.length})
            </Button>
          )}
          <Button
            onClick={() => navigate("/officer-visit/create")}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 shadow-sm text-xs h-9 px-3 font-semibold"
          >
            <Plus className="h-4 w-4" /> Add Observation
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search action point, observation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 border-border rounded-lg text-xs"
            />
          </div>

          {/* Client Filter */}
          <div className="w-full md:w-[180px]">
            <Select
              value={selectedClientFilter}
              onValueChange={handleClientFilterChange}
            >
              <SelectTrigger className="h-10 border border-border rounded-lg bg-background text-foreground text-xs">
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
          </div>

          {/* Site Filter */}
          <div className="w-full md:w-[180px]">
            <Select
              value={selectedSiteFilter}
              onValueChange={setSelectedSiteFilter}
              disabled={selectedClientFilter === "all"}
            >
              <SelectTrigger className="h-10 border border-border rounded-lg bg-background text-foreground text-xs">
                <SelectValue placeholder="All Sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Sorting Filter */}
          <div className="w-full md:w-[150px]">
            <Select value={dateSort} onValueChange={(val) => setDateSort(val)}>
              <SelectTrigger className="h-10 border border-border rounded-lg bg-background text-foreground text-xs">
                <SelectValue placeholder="Sort Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Observations Grid/Table */}
      <Card className="rounded-[14px] border border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="px-6 py-4 border-b">
          <CardTitle className="text-base font-bold text-foreground">
            Recent Findings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-border text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-3 pl-6 w-[50px]">
                    <input
                      type="checkbox"
                      checked={
                        filteredObservations.length > 0 &&
                        selectedObsIds.length === filteredObservations.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 h-3.5 w-3.5 accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Site</th>
                  <th className="p-3">Action Point</th>
                  <th className="p-3">Observation</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-muted-foreground"
                    >
                      Loading findings...
                    </td>
                  </tr>
                ) : filteredObservations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-muted-foreground italic"
                    >
                      No observations found. Click "+ Add Observation" to create
                      one.
                    </td>
                  </tr>
                ) : (
                  sortedObservations.map((o) => {
                    const siteName = o.siteId
                      ? allSites.find((s) => s.id === o.siteId)?.name ||
                        `Site #${o.siteId}`
                      : "N/A";
                    return (
                      <tr
                        key={o.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="p-3 pl-6">
                          <input
                            type="checkbox"
                            checked={selectedObsIds.includes(o.id)}
                            onChange={(e) =>
                              handleSelectOne(o.id, e.target.checked)
                            }
                            className="rounded border-gray-300 h-3.5 w-3.5 accent-blue-600 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                          {siteName}
                        </td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">
                          {o.actionPoint}
                        </td>
                        <td
                          className="p-3 text-slate-600 dark:text-slate-400 max-w-xs truncate"
                          title={o.observation}
                        >
                          {o.observation}
                        </td>
                        <td className="p-3 text-slate-500 dark:text-slate-400 font-medium">
                          {o.createdOn}
                        </td>
                        <td className="p-3">
                          <Badge
                            className={
                              o.status === "Resolved"
                                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold hover:bg-emerald-500/20"
                                : "bg-red-500/10 text-rose-600 border border-red-500/20 px-2 py-0.5 rounded-full font-bold hover:bg-red-500/20"
                            }
                          >
                            {o.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3 pr-6 text-right space-x-2">
                          <Button
                            onClick={() => {
                              setSelectedObs(o);
                              setIsViewOpen(true);
                            }}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50/60"
                          >
                            <Eye className="h-4.5 w-4.5" />
                          </Button>
                          <Button
                            onClick={(e) => handleDelete(o.id, e)}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50/60"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Observation Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto rounded-[16px] p-6 border bg-card shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              Add Observation
            </DialogTitle>
            <DialogDescription>
              Create a new record for security finding.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs mt-3">
            {/* Target Client & Site selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-600 font-semibold">Client</label>
                <Select value={formClient} onValueChange={setFormClient}>
                  <SelectTrigger className="h-9 border-border rounded-lg bg-background text-sm">
                    <SelectValue placeholder="Choose a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose a client...</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-600 font-semibold">Site</label>
                <Select
                  value={formSite}
                  onValueChange={setFormSite}
                  disabled={formClient === "none"}
                >
                  <SelectTrigger className="h-9 border-border rounded-lg bg-background text-sm">
                    <SelectValue
                      placeholder={
                        formClient !== "none"
                          ? "Choose a site..."
                          : "Choose client first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose a site...</SelectItem>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Action Point Selection */}
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-center justify-between">
                <label className="text-slate-600 font-semibold">
                  Action Point (Location / Sector) *
                </label>
                <button
                  type="button"
                  onClick={() => setUseCustomActionPoint(!useCustomActionPoint)}
                  className="text-blue-600 hover:text-blue-700 font-semibold hover:underline"
                >
                  {useCustomActionPoint
                    ? "Select from list"
                    : "Enter custom location"}
                </button>
              </div>

              {useCustomActionPoint ? (
                <Input
                  placeholder="e.g. Main Gate 02, Warehouse B..."
                  value={customActionPoint}
                  onChange={(e) => setCustomActionPoint(e.target.value)}
                  className="h-9 border-border rounded-lg"
                />
              ) : (
                <Select
                  value={actionPoint}
                  onValueChange={setActionPoint}
                  disabled={formSite === "none"}
                >
                  <SelectTrigger className="h-9 border-border rounded-lg bg-background text-sm">
                    <SelectValue
                      placeholder={
                        formSite !== "none"
                          ? "Select a location/sector..."
                          : "Please select site first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {checkpoints.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No checkpoints found for this site
                      </SelectItem>
                    ) : (
                      checkpoints.map((cp) => (
                        <SelectItem key={cp.id} value={cp.name}>
                          {cp.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Observation Textarea */}
            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">
                Observation *
              </label>
              <Textarea
                placeholder="Describe what was discovered..."
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                className="min-h-[70px] border-border rounded-lg"
                required
              />
            </div>

            {/* Action Required & Action Done side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-600 font-semibold">
                  Action Required
                </label>
                <Input
                  placeholder="Specify next steps..."
                  value={actionRequired}
                  onChange={(e) => setActionRequired(e.target.value)}
                  className="h-9 border-border rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-600 font-semibold">
                  Action Done
                </label>
                <Input
                  placeholder="Actions already taken..."
                  value={actionDone}
                  onChange={(e) => setActionDone(e.target.value)}
                  className="h-9 border-border rounded-lg"
                />
              </div>
            </div>

            {/* Corrective Measures */}
            <div className="space-y-1.5">
              <label className="text-slate-600 font-semibold">
                Corrective Measures
              </label>
              <Textarea
                placeholder="Long-term solutions..."
                value={correctiveMeasures}
                onChange={(e) => setCorrectiveMeasures(e.target.value)}
                className="min-h-[60px] border-border rounded-lg"
              />
            </div>

            {/* Remarks & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-600 font-semibold">Remarks</label>
                <Input
                  placeholder="Internal notes..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="h-9 border-border rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-600 font-semibold block mb-1">
                  Status
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("Pending")}
                    className={`flex-1 h-9 rounded-lg border flex items-center justify-center gap-1.5 font-bold transition-all ${status === "Pending" ? "bg-rose-50 border-rose-200 text-rose-600 ring-1 ring-rose-200" : "bg-background border-border text-slate-600 hover:bg-slate-50"}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-600" />{" "}
                    Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("Resolved")}
                    className={`flex-1 h-9 rounded-lg border flex items-center justify-center gap-1.5 font-bold transition-all ${status === "Resolved" ? "bg-emerald-50 border-emerald-200 text-emerald-600 ring-1 ring-emerald-200" : "bg-background border-border text-slate-600 hover:bg-slate-50"}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />{" "}
                    Resolved
                  </button>
                </div>
              </div>
            </div>

            {/* Photos (Evidence) */}
            <div className="space-y-2 border-t pt-3">
              <label className="text-slate-600 font-semibold">
                Photos (Evidence)
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="cursor-pointer flex-shrink-0">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                    }}
                  />

                  <div className="h-16 w-16 border-2 border-dashed border-border hover:border-blue-500 rounded-lg flex flex-col items-center justify-center text-[10px] text-slate-400 hover:text-blue-500 transition-colors gap-1">
                    <Upload className="h-4.5 w-4.5" />
                    <span>Upload File</span>
                  </div>
                </label>

                {photos.map((photoUrl, idx) => (
                  <div
                    key={idx}
                    className="relative h-16 w-16 rounded-lg overflow-hidden border border-border flex-shrink-0 group"
                  >
                    <img
                      src={photoUrl}
                      alt="Evidence"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4.5 w-4.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 border-t pt-4 mt-6">
              <Button
                type="button"
                onClick={() => setIsAddOpen(false)}
                variant="outline"
                className="h-10 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white h-10 rounded-lg shadow-sm font-semibold"
              >
                Submit Observation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Observation details modal */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-[16px] p-6 border bg-card shadow-lg text-xs">
          {selectedObs && (
            <>
              <DialogHeader className="border-b pb-3">
                <div className="flex items-center justify-between gap-4">
                  <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                    Observation Finding Details
                  </DialogTitle>
                  <Badge
                    className={
                      selectedObs.status === "Resolved"
                        ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold"
                        : "bg-red-500/10 text-rose-600 border border-red-500/20 px-2 py-0.5 rounded-full font-bold"
                    }
                  >
                    {selectedObs.status.toUpperCase()}
                  </Badge>
                </div>
                <DialogDescription>
                  Details for observation submitted on {selectedObs.createdOn}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4 border-b pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Action Point
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                      {selectedObs.actionPoint}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Date Logged
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                      {selectedObs.createdOn}
                    </span>
                  </div>
                </div>

                <div className="border-b pb-3">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                    Observation Finding
                  </span>
                  <p className="text-slate-700 dark:text-slate-200 font-medium mt-1 leading-relaxed whitespace-pre-wrap">
                    {selectedObs.observation}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Action Required
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 block mt-0.5">
                      {selectedObs.actionRequired || "None specified"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Action Done
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 block mt-0.5">
                      {selectedObs.actionDone || "None specified"}
                    </span>
                  </div>
                </div>

                {selectedObs.correctiveMeasures && (
                  <div className="border-b pb-3">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Corrective Measures
                    </span>
                    <p className="text-slate-700 dark:text-slate-200 font-medium mt-1 whitespace-pre-wrap">
                      {selectedObs.correctiveMeasures}
                    </p>
                  </div>
                )}

                {selectedObs.remarks && (
                  <div className="border-b pb-3">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Remarks / Notes
                    </span>
                    <p className="text-slate-700 dark:text-slate-200 font-medium mt-1">
                      {selectedObs.remarks}
                    </p>
                  </div>
                )}

                {selectedObs.photos && selectedObs.photos.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">
                      Evidence Photos
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedObs.photos.map((p, pIdx) => (
                        <div
                          key={pIdx}
                          className="aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800"
                        >
                          <img
                            src={p}
                            alt="Evidence"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-6 border-t pt-4">
                <Button
                  onClick={() => setIsViewOpen(false)}
                  className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg h-9"
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
