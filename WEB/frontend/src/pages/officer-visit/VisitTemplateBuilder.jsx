import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Settings,
  Layers,
  Edit3,
  AlignLeft,
  CheckSquare,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import api from "../../services/api";

export default function VisitTemplateBuilder() {
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] =
    useState("temp-default-visit");
  // Modals state
  const [isAddTemplateOpen, setIsAddTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isRenameTemplateOpen, setIsRenameTemplateOpen] = useState(false);
  const [renameTemplateName, setRenameTemplateName] = useState("");

  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [isAddQuestionOpen, setIsAddQuestionOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState("");

  // Edit / Add Question form
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState("yes_no");
  const [qRequired, setQRequired] = useState(false);
  const [qPhotoReq, setQPhotoReq] = useState(false);
  const [qGpsReq, setQGpsReq] = useState(false);
  const [qRemarksAllowed, setQRemarksAllowed] = useState(true);
  const [qOptions, setQOptions] = useState(["Yes", "No"]);
  const [expandedSections, setExpandedSections] = useState({});
  const [isRenameSectionOpen, setIsRenameSectionOpen] = useState(false);
  const [oldSectionName, setOldSectionName] = useState("");
  const [renameSectionName, setRenameSectionName] = useState("");

  // Active template helpers
  const activeTemplate =
    templates.find((t) => t.id === activeTemplateId) || templates[0];
  const sections = activeTemplate?.sections || [];
  const questions = activeTemplate?.questions || [];

  // Helper setter to update active template and auto-save to database
  const updateActiveTemplate = async (updater) => {
    if (!activeTemplate) return;
    const updatedTemplate = updater(activeTemplate);
    const updatedTemplates = templates.map((t) =>
      t.id === activeTemplate.id ? updatedTemplate : t,
    );
    setTemplates(updatedTemplates);
    try {
      await api.post("/officer-visits/templates", updatedTemplate);
    } catch (err) {
      console.error("Failed to auto-save template:", err);
    }
  };

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await api.get("/officer-visits/templates");
        const loadedTemplates = res.data;
        setTemplates(loadedTemplates);
        if (loadedTemplates.length > 0) {
          setActiveTemplateId(loadedTemplates[0].id);
        }
      } catch (err) {
        console.error("Failed to load templates:", err);
      }
    };
    loadTemplates();
  }, []);

  const handleAddTemplate = async () => {
    if (!newTemplateName) return;
    const newTemp = {
      id: `temp-${Date.now()}`,
      name: newTemplateName,
      sections: ["Guards & Alertness", "Documentation"],
      questions: [],
    };
    try {
      await api.post("/officer-visits/templates", newTemp);
      const updated = [...templates, newTemp];
      setTemplates(updated);
      setActiveTemplateId(newTemp.id);
      setNewTemplateName("");
      setIsAddTemplateOpen(false);
    } catch (err) {
      console.error("Failed to add template:", err);
    }
  };

  const handleRenameTemplate = async () => {
    if (!renameTemplateName || !activeTemplate) return;
    const updatedTemplate = { ...activeTemplate, name: renameTemplateName };
    try {
      await api.post("/officer-visits/templates", updatedTemplate);
      const updated = templates.map((t) =>
        t.id === activeTemplate.id ? updatedTemplate : t,
      );
      setTemplates(updated);
      setIsRenameTemplateOpen(false);
    } catch (err) {
      console.error("Failed to rename template:", err);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!activeTemplate) return;
    if (templates.length <= 1) {
      alert("Cannot delete the only remaining template.");
      return;
    }
    if (
      window.confirm(
        `Are you sure you want to delete the template "${activeTemplate.name}"?`,
      )
    ) {
      try {
        await api.delete(`/officer-visits/templates/${activeTemplate.id}`);
        const updated = templates.filter((t) => t.id !== activeTemplate.id);
        setTemplates(updated);
        setActiveTemplateId(updated[0].id);
      } catch (err) {
        console.error("Failed to delete template:", err);
      }
    }
  };

  const handleAddSection = () => {
    if (!newSectionName || sections.includes(newSectionName)) return;
    updateActiveTemplate((prev) => ({
      ...prev,
      sections: [...prev.sections, newSectionName],
    }));
    setNewSectionName("");
    setIsAddSectionOpen(false);
  };

  const handleDeleteSection = (secName) => {
    if (
      window.confirm(
        `Are you sure you want to delete section "${secName}"? All questions in it will be removed.`,
      )
    ) {
      updateActiveTemplate((prev) => ({
        ...prev,
        sections: prev.sections.filter((s) => s !== secName),
        questions: prev.questions.filter((q) => q.section !== secName),
      }));
    }
  };

  const toggleExpandSection = (secName) => {
    setExpandedSections((prev) => ({
      ...prev,
      [secName]: !prev[secName],
    }));
  };

  const handleOpenRenameSection = (secName) => {
    setOldSectionName(secName);
    setRenameSectionName(secName);
    setIsRenameSectionOpen(true);
  };

  const handleRenameSection = () => {
    if (!renameSectionName || renameSectionName === oldSectionName) return;
    updateActiveTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s === oldSectionName ? renameSectionName : s,
      ),
      questions: prev.questions.map((q) =>
        q.section === oldSectionName ? { ...q, section: renameSectionName } : q,
      ),
    }));
    setIsRenameSectionOpen(false);
  };

  const handleOpenAddQuestion = (secName) => {
    setSelectedSection(secName);
    setEditingQuestionId(null);
    setQText("");
    setQType("yes_no");
    setQRequired(false);
    setQPhotoReq(false);
    setQGpsReq(false);
    setQRemarksAllowed(true);
    setQOptions(["Yes", "No"]);
    setIsAddQuestionOpen(true);
  };

  const handleSaveQuestion = () => {
    if (!qText) return;

    updateActiveTemplate((prev) => {
      let updatedQs = [...prev.questions];
      if (editingQuestionId) {
        updatedQs = updatedQs.map((q) =>
          q.id === editingQuestionId
            ? {
                ...q,
                question: qText,
                answerType: qType,
                required: qRequired,
                photoRequired: qPhotoReq,
                gpsRequired: qGpsReq,
                remarksAllowed: qRemarksAllowed,
                options:
                  qType === "yes_no" || qType === "dropdown"
                    ? qOptions
                    : undefined,
              }
            : q,
        );
      } else {
        const newQ = {
          id: `pq-${Date.now()}`,
          section: selectedSection,
          question: qText,
          answerType: qType,
          required: qRequired,
          photoRequired: qPhotoReq,
          gpsRequired: qGpsReq,
          remarksAllowed: qRemarksAllowed,
          options:
            qType === "yes_no" || qType === "dropdown" ? qOptions : undefined,
          answer: "",
        };
        updatedQs.push(newQ);
      }
      return { ...prev, questions: updatedQs };
    });

    setIsAddQuestionOpen(false);
  };

  const handleEditQuestion = (q) => {
    setSelectedSection(q.section);
    setEditingQuestionId(q.id);
    setQText(q.question);
    setQType(q.answerType);
    setQRequired(q.required);
    setQPhotoReq(q.photoRequired);
    setQGpsReq(q.gpsRequired);
    setQRemarksAllowed(q.remarksAllowed);
    setQOptions(q.options || ["Yes", "No"]);
    setIsAddQuestionOpen(true);
  };

  const handleDeleteQuestion = (qId) => {
    if (window.confirm("Are you sure you want to delete this question?")) {
      updateActiveTemplate((prev) => ({
        ...prev,
        questions: prev.questions.filter((q) => q.id !== qId),
      }));
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Officer Day Visit Template Builder
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Build and organize checklist templates for Officer Day Visit rounds.
          </p>
        </div>

        {templates.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={activeTemplateId}
              onValueChange={setActiveTemplateId}
            >
              <SelectTrigger className="w-56 h-10 border border-slate-200 dark:border-slate-800 bg-background rounded-lg text-xs font-semibold">
                <SelectValue placeholder="Select template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((temp) => (
                  <SelectItem key={temp.id} value={temp.id} className="text-xs">
                    {temp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setRenameTemplateName(activeTemplate?.name || "");
                setIsRenameTemplateOpen(true);
              }}
              className="h-10 w-10 rounded-lg"
              title="Rename active template"
            >
              <Edit3 className="h-4 w-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
            </Button>

            <Button
              variant="destructive"
              size="icon"
              onClick={handleDeleteTemplate}
              className="h-10 w-10 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20"
              title="Delete active template"
            >
              <Trash2 className="h-4 w-4" />
            </Button>

            <Button
              onClick={() => setIsAddTemplateOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 h-10 text-xs font-semibold px-3.5"
            >
              <Plus className="h-4 w-4" /> New Template
            </Button>
          </div>
        )}
      </div>

      {templates.length === 0 ? (
        <Card className="border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center rounded-2xl bg-card">
          <div className="max-w-md mx-auto space-y-4">
            <FileText className="h-10 w-10 text-slate-400 dark:text-slate-500 mx-auto" />
            <h2 className="text-sm font-bold text-foreground">
              No templates available
            </h2>
            <p className="text-xs text-muted-foreground">
              Create a new template to start building questions.
            </p>
            <Button
              onClick={() => setIsAddTemplateOpen(true)}
              className="bg-blue-600 text-white text-xs font-semibold h-9 rounded-lg"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Create Template
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Main workspace */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="h-4.5 w-4.5 text-blue-600" /> Checklist
                Sections
              </h2>
              <Button
                onClick={() => setIsAddSectionOpen(true)}
                variant="outline"
                className="h-8 text-[11px] font-semibold rounded-lg flex items-center gap-1 border-slate-200 dark:border-slate-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add Section
              </Button>
            </div>

            {sections.length === 0 ? (
              <Card className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-card/50">
                <p className="text-xs text-muted-foreground italic">
                  No sections created yet. Add a section to start organizing
                  questions.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {sections.map((section) => {
                  const sectionQs = questions.filter(
                    (q) => q.section === section,
                  );
                  const isExpanded = !!expandedSections[section];

                  return (
                    <Card
                      key={section}
                      className="border border-slate-100 dark:border-slate-900 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden bg-card"
                    >
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-900 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleExpandSection(section)}
                            className="p-1 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 dark:text-slate-500 transition-colors"
                          >
                            <Settings
                              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-95 text-blue-600" : ""}`}
                            />
                          </button>
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                            {section.toUpperCase()}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          >
                            {sectionQs.length}{" "}
                            {sectionQs.length === 1 ? "Question" : "Questions"}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            onClick={() => handleOpenAddQuestion(section)}
                            className="h-8 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50/10 px-2 rounded-lg"
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Question
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => handleOpenRenameSection(section)}
                            className="h-8 text-[11px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-200 px-2 rounded-lg"
                          >
                            Rename
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteSection(section)}
                            className="h-8 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50/10 px-2 rounded-lg"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      {/* Questions list */}
                      {(!isExpanded || sectionQs.length > 0) && (
                        <CardContent className="p-4 space-y-2 bg-card">
                          {sectionQs.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground italic text-center py-4">
                              No questions in this section yet.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {sectionQs.map((q) => (
                                <div
                                  key={q.id}
                                  className="flex items-start justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-900 dark:border-slate-800/80 bg-background shadow-xs hover:border-slate-200 dark:hover:border-slate-700 transition-all gap-4"
                                >
                                  <div className="flex gap-3">
                                    <div className="mt-0.5">
                                      {q.answerType === "yes_no" && (
                                        <CheckSquare className="h-4 w-4 text-emerald-500" />
                                      )}
                                      {q.answerType === "text" && (
                                        <AlignLeft className="h-4 w-4 text-blue-500" />
                                      )}
                                      {q.answerType === "number" && (
                                        <span className="font-bold text-xs text-amber-500">
                                          #
                                        </span>
                                      )}
                                      {q.answerType === "dropdown" && (
                                        <Settings className="h-4 w-4 text-purple-500" />
                                      )}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                        {q.question}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <Badge className="text-[9px] uppercase px-1.5 py-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 font-semibold">
                                          {q.answerType === "yes_no"
                                            ? "Yes / No"
                                            : q.answerType}
                                        </Badge>
                                        {q.required && (
                                          <Badge className="text-[9px] bg-rose-500/10 text-rose-500 border border-rose-500/10 font-medium">
                                            Required
                                          </Badge>
                                        )}
                                        {q.photoRequired && (
                                          <Badge className="text-[9px] bg-sky-500/10 text-sky-500 border border-sky-500/10 font-medium">
                                            Photo
                                          </Badge>
                                        )}
                                        {q.gpsRequired && (
                                          <Badge className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/10 font-medium">
                                            GPS
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex gap-1 shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEditQuestion(q)}
                                      className="h-7 w-7 text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-200"
                                      title="Edit Question"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteQuestion(q.id)}
                                      className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                      title="Delete Question"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Template Dialog */}
      <Dialog open={isAddTemplateOpen} onOpenChange={setIsAddTemplateOpen}>
        <DialogContent className="max-w-md rounded-2xl border bg-card p-6 shadow-lg text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              Create New Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-300 font-semibold block">
                Template Name
              </label>
              <Input
                placeholder="e.g. Monthly Safety Audit"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="h-10 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                onClick={() => setIsAddTemplateOpen(false)}
                variant="outline"
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddTemplate}
                className="bg-blue-600 text-white h-9 text-xs font-semibold"
              >
                Create Template
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Template Dialog */}
      <Dialog
        open={isRenameTemplateOpen}
        onOpenChange={setIsRenameTemplateOpen}
      >
        <DialogContent className="max-w-md rounded-2xl border bg-card p-6 shadow-lg text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              Rename Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-300 font-semibold block">
                Template Name
              </label>
              <Input
                placeholder="e.g. Monthly Safety Audit"
                value={renameTemplateName}
                onChange={(e) => setRenameTemplateName(e.target.value)}
                className="h-10 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                onClick={() => setIsRenameTemplateOpen(false)}
                variant="outline"
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRenameTemplate}
                className="bg-blue-600 text-white h-9 text-xs font-semibold"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Section Dialog */}
      <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
        <DialogContent className="max-w-md rounded-2xl border bg-card p-6 shadow-lg text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              Add New Section
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-300 font-semibold block">
                Section Name
              </label>
              <Input
                placeholder="e.g. Safety Equipment"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                className="h-10 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                onClick={() => setIsAddSectionOpen(false)}
                variant="outline"
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddSection}
                className="bg-blue-600 text-white h-9 text-xs font-semibold"
              >
                Add Section
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Section Dialog */}
      <Dialog open={isRenameSectionOpen} onOpenChange={setIsRenameSectionOpen}>
        <DialogContent className="max-w-md rounded-2xl border bg-card p-6 shadow-lg text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              Rename Section
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-300 font-semibold block">
                Section Name
              </label>
              <Input
                placeholder="e.g. Safety Equipment"
                value={renameSectionName}
                onChange={(e) => setRenameSectionName(e.target.value)}
                className="h-10 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                onClick={() => setIsRenameSectionOpen(false)}
                variant="outline"
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRenameSection}
                className="bg-blue-600 text-white h-9 text-xs font-semibold"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Question Dialog */}
      <Dialog open={isAddQuestionOpen} onOpenChange={setIsAddQuestionOpen}>
        <DialogContent className="max-w-md rounded-2xl border bg-card p-6 shadow-lg text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {editingQuestionId
                ? "Edit Checklist Question"
                : "Add Checklist Question"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-300 font-semibold block">
                Question Label / Prompt
              </label>
              <Input
                placeholder="e.g. Are all gates locked?"
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                className="h-10 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-300 font-semibold block">
                Answer Type
              </label>
              <Select value={qType} onValueChange={(val) => setQType(val)}>
                <SelectTrigger className="h-10 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes_no" className="text-xs">
                    Yes / No Toggle
                  </SelectItem>
                  <SelectItem value="text" className="text-xs">
                    Text Input Box
                  </SelectItem>
                  <SelectItem value="number" className="text-xs">
                    Numeric Box
                  </SelectItem>
                  <SelectItem value="dropdown" className="text-xs">
                    Dropdown Selector
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {qType === "dropdown" && (
              <div className="space-y-1.5">
                <label className="text-slate-600 dark:text-slate-300 font-semibold block">
                  Options (Comma separated)
                </label>
                <Input
                  placeholder="All Ok, Needs Maintenance, Critical"
                  value={qOptions.join(", ")}
                  onChange={(e) =>
                    setQOptions(
                      e.target.value
                        .split(",")
                        .map((o) => o.trim())
                        .filter(Boolean),
                    )
                  }
                  className="h-10 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="qRequired"
                  checked={qRequired}
                  onChange={(e) => setQRequired(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                />
                <label
                  htmlFor="qRequired"
                  className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300"
                >
                  Answer is Required
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="qPhotoReq"
                  checked={qPhotoReq}
                  onChange={(e) => setQPhotoReq(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                />

                <label
                  htmlFor="qPhotoReq"
                  className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300"
                >
                  Requires Photo
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="qGpsReq"
                  checked={qGpsReq}
                  onChange={(e) => setQGpsReq(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                />

                <label
                  htmlFor="qGpsReq"
                  className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300"
                >
                  Requires GPS
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="qRemarksAllowed"
                  checked={qRemarksAllowed}
                  onChange={(e) => setQRemarksAllowed(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                />

                <label
                  htmlFor="qRemarksAllowed"
                  className="font-semibold text-slate-700 dark:text-slate-200 dark:text-slate-300"
                >
                  Allow Remarks
                </label>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2 border-t">
              <Button
                onClick={() => setIsAddQuestionOpen(false)}
                variant="outline"
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveQuestion}
                className="bg-blue-600 text-white h-9 text-xs font-semibold"
              >
                Save Question
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}