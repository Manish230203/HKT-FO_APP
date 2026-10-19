import React, { useState, useEffect } from "react";
import {
  ClipboardCheck,
  Search,
  Plus,
  Trash2,
  Check,
  Camera,
  MessageSquare,
  AlertTriangle,
  Building,
  Save,
  Shield,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import api from "../services/api";

const DEFAULT_QUESTIONS = [
  {
    text: "Are all entry and exit visitor registers properly maintained and up to date?",
    response_type: "yes_no",
    options: ["Yes", "No"],
    is_critical: true,
    requires_photo: false,
    requires_comment: true,
  },
  {
    text: "Is the main gate CCTV and surveillance equipment operating correctly?",
    response_type: "yes_no",
    options: ["Yes", "No"],
    is_critical: true,
    requires_photo: true,
    requires_comment: true,
  },
  {
    text: "Are security guards in complete uniform, turnout, shoes, and wearing ID badges?",
    response_type: "yes_no",
    options: ["Yes", "No"],
    is_critical: false,
    requires_photo: true,
    requires_comment: true,
  },
  {
    text: "Are perimeter gates, locks, and boundary fences intact without unauthorized entry?",
    response_type: "yes_no",
    options: ["Yes", "No"],
    is_critical: true,
    requires_photo: false,
    requires_comment: true,
  },
  {
    text: "Are fire extinguishers, hydrants, and emergency exit doors clear and pressurized?",
    response_type: "yes_no",
    options: ["Yes", "No"],
    is_critical: false,
    requires_photo: true,
    requires_comment: true,
  },
  {
    text: "Is night/perimeter lighting sufficient and properly illuminating all sensitive posts?",
    response_type: "yes_no",
    options: ["Yes", "No"],
    is_critical: false,
    requires_photo: false,
    requires_comment: true,
  },
  {
    text: "Any client complaints, security incidents, or pending remarks reported during the visit?",
    response_type: "yes_no",
    options: ["Yes", "No"],
    is_critical: false,
    requires_photo: false,
    requires_comment: true,
  },
];

export default function SiteChecklists() {
  const [siteList, setSiteList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedSite, setSelectedSite] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");

  const fetchSites = async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/site-checklists");
      setSiteList(res.data || []);
    } catch (e) {
      console.error("Error loading site checklists:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const handleOpenAssignModal = async (site) => {
    setSelectedSite(site);
    try {
      const res = await api.get(`/sites/${site.site_id}/checklist`);
      if (res.data && res.data.questions && res.data.questions.length > 0) {
        setChecklistTitle(res.data.title || `Site Checklist - ${site.site_name}`);
        setQuestions(
          res.data.questions.map((q) => ({
            text: q.text,
            response_type: q.response_type || "yes_no",
            options: q.options || ["Yes", "No"],
            is_critical: !!q.is_critical,
            requires_photo: !!q.requires_photo,
            requires_comment: q.requires_comment !== false,
          }))
        );
      } else {
        setChecklistTitle(`Site Inspection Checklist - ${site.site_name}`);
        setQuestions([...DEFAULT_QUESTIONS]);
      }
    } catch (e) {
      setChecklistTitle(`Site Inspection Checklist - ${site.site_name}`);
      setQuestions([...DEFAULT_QUESTIONS]);
    }
    setDialogOpen(true);
  };

  const handleAddQuestion = () => {
    if (!newQuestionText.trim()) return;
    setQuestions([
      ...questions,
      {
        text: newQuestionText.trim(),
        response_type: "yes_no",
        options: ["Yes", "No"],
        is_critical: false,
        requires_photo: false,
        requires_comment: true,
      },
    ]);
    setNewQuestionText("");
  };

  const handleRemoveQuestion = (idx) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleToggleProp = (idx, prop) => {
    setQuestions(
      questions.map((q, i) => (i === idx ? { ...q, [prop]: !q[prop] } : q))
    );
  };

  const handleSaveChecklist = async () => {
    if (!selectedSite) return;
    try {
      setSaving(true);
      await api.post(`/admin/sites/${selectedSite.site_id}/assign-checklist`, {
        title: checklistTitle.trim() || `Site Checklist - ${selectedSite.site_name}`,
        questions: questions,
      });
      alert(`Checklist successfully assigned to ${selectedSite.site_name}!`);
      setDialogOpen(false);
      fetchSites();
    } catch (e) {
      console.error("Failed to assign checklist:", e);
      alert("Error saving checklist. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const filteredSites = siteList.filter(
    (s) =>
      s.site_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.client_name && s.client_name.toLowerCase().includes(search.toLowerCase())) ||
      (s.branch_name && s.branch_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 text-sm">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-sky-500" />
            Site Checklists (Area Manager)
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Assign custom inspection checklists and photo/remark requirements for each site. Field officers will see these questions after scanning the site QR code.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search site, client..."
              className="pl-9 h-9 text-xs bg-card"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Sites Grid */}
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading site checklists...</div>
      ) : filteredSites.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border">
          <Building className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold">No sites found</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSites.map((site) => (
            <div
              key={site.site_id}
              className="bg-card hover:border-sky-500/50 transition-all rounded-2xl border border-border p-5 flex flex-col justify-between shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground leading-tight line-clamp-1">
                        {site.site_name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {site.client_name}
                      </p>
                    </div>
                  </div>
                  {site.has_custom_checklist ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                      Customized
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[10px]">
                      Standard
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5 py-2 border-t border-border/50 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Assigned Checklist:</span>
                    <span className="font-semibold text-foreground text-right line-clamp-1 max-w-[170px]">
                      {site.checklist_title}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Branch:</span>
                    <span className="font-medium text-foreground">{site.branch_name}</span>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4 rounded-xl text-xs font-bold hover:bg-sky-500 hover:text-white transition-colors"
                onClick={() => handleOpenAssignModal(site)}
              >
                <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                Configure Checklist
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Checklist Assignment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-sky-500" />
              Configure Checklist: {selectedSite?.site_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                CHECKLIST TITLE
              </label>
              <Input
                value={checklistTitle}
                onChange={(e) => setChecklistTitle(e.target.value)}
                placeholder="e.g. Daily Security & Facility Inspection"
                className="text-xs"
              />
            </div>

            {/* Questions List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-muted-foreground">
                  QUESTIONS ({questions.length})
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Click badges to toggle Photo / Remark requirements
                </span>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-muted/30 rounded-xl border border-border flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1">
                        <span className="text-xs font-bold text-sky-500 mt-0.5">#{idx + 1}</span>
                        <p className="text-xs font-medium text-foreground leading-relaxed">{q.text}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveQuestion(idx)}
                        className="text-muted-foreground hover:text-rose-500 transition-colors p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                      <button
                        type="button"
                        onClick={() => handleToggleProp(idx, "requires_photo")}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-all ${
                          q.requires_photo
                            ? "bg-amber-500/20 text-amber-500 border border-amber-500/30"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        <Camera className="h-3 w-3" />
                        {q.requires_photo ? "Photo Required" : "Photo Optional"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleProp(idx, "requires_comment")}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-all ${
                          q.requires_comment
                            ? "bg-sky-500/20 text-sky-500 border border-sky-500/30"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        <MessageSquare className="h-3 w-3" />
                        {q.requires_comment ? "Remark Required" : "Remark Optional"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleProp(idx, "is_critical")}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition-all ${
                          q.is_critical
                            ? "bg-rose-500/20 text-rose-500 border border-rose-500/30"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {q.is_critical ? "Critical" : "Standard"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Question Row */}
            <div className="pt-2">
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                ADD QUESTION
              </label>
              <div className="flex gap-2">
                <Input
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddQuestion()}
                  placeholder="Type new question and press Enter..."
                  className="text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddQuestion}
                  className="shrink-0 rounded-xl bg-sky-500 hover:bg-sky-600 text-white"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveChecklist}
              disabled={saving || questions.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Saving..." : "Save & Assign to Site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
