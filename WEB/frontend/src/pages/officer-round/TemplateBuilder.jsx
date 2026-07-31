import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Save,
  Eye,
  Layers,
  Edit3,
  GripVertical,
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
import { getStoredTemplates } from "./mockData";
import api from "../../services/api";

export default function TemplateBuilder() {
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState("temp-default");
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
  const [draggedSectionIdx, setDraggedSectionIdx] = useState(null);
  const [draggedQuestionId, setDraggedQuestionId] = useState(null);
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
      await api.post("/officer-rounds/templates", updatedTemplate);
    } catch (err) {
      console.error("Failed to auto-save template:", err);
    }
  };

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await api.get("/officer-rounds/templates");
        const loadedTemplates = res.data;
        if (loadedTemplates && loadedTemplates.length > 0) {
          setTemplates(loadedTemplates);
          setActiveTemplateId(loadedTemplates[0].id);
        } else {
          const localTemplates = getStoredTemplates();
          setTemplates(localTemplates);
          if (localTemplates.length > 0) {
            setActiveTemplateId(localTemplates[0].id);
          }
        }
      } catch (err) {
        console.error(
          "Failed to load templates from API, falling back to localStorage:",
          err,
        );
        const localTemplates = getStoredTemplates();
        setTemplates(localTemplates);
        if (localTemplates.length > 0) {
          setActiveTemplateId(localTemplates[0].id);
        }
      }
    };
    loadTemplates();
  }, []);

  const handleAddTemplate = async () => {
    if (!newTemplateName) return;
    const newTemp = {
      id: `temp-${Date.now()}`,
      name: newTemplateName,
      sections: ["Guards & Alertness", "Infrastructure Security"],
      questions: [],
    };
    try {
      await api.post("/officer-rounds/templates", newTemp);
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
      await api.post("/officer-rounds/templates", updatedTemplate);
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
        await api.delete(`/officer-rounds/templates/${activeTemplate.id}`);
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
          id: `q-${Date.now()}`,
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
    setQOptions(
      q.options ||
        (q.answerType === "yes_no" ? ["Yes", "No"] : ["Option 1", "Option 2"]),
    );
    setIsAddQuestionOpen(true);
  };

  const handleDeleteQuestion = (id) => {
    if (window.confirm("Delete this question?")) {
      updateActiveTemplate((prev) => ({
        ...prev,
        questions: prev.questions.filter((q) => q.id !== id),
      }));
    }
  };

  const handleSectionDrop = (targetIdx) => {
    if (draggedSectionIdx === null || draggedSectionIdx === targetIdx) return;
    updateActiveTemplate((prev) => {
      const updated = [...prev.sections];
      const draggedItem = updated[draggedSectionIdx];
      updated.splice(draggedSectionIdx, 1);
      updated.splice(targetIdx, 0, draggedItem);
      return { ...prev, sections: updated };
    });
    setDraggedSectionIdx(null);
  };

  const handleQuestionDrop = (targetId) => {
    if (draggedQuestionId === null || draggedQuestionId === targetId) return;
    const draggedIdx = questions.findIndex((q) => q.id === draggedQuestionId);
    const targetIdx = questions.findIndex((q) => q.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;
    if (questions[draggedIdx].section !== questions[targetIdx].section) return;

    updateActiveTemplate((prev) => {
      const updated = [...prev.questions];
      const [draggedItem] = updated.splice(draggedIdx, 1);
      updated.splice(targetIdx, 0, draggedItem);
      return { ...prev, questions: updated };
    });
    setDraggedQuestionId(null);
  };

  const handleSaveTemplate = async () => {
    if (!activeTemplate) return;
    try {
      await api.post("/officer-rounds/templates", activeTemplate);
      alert("Template saved successfully!");
    } catch (err) {
      console.error("Failed to save template:", err);
      alert("Failed to save template.");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Inspection Template Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customize inspection sections, compliance checklist questions, and
            dynamic fields
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSaveTemplate}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center gap-2 font-semibold shadow-sm"
          >
            <Save className="h-4.5 w-4.5" /> Save Template
          </Button>
        </div>
      </div>

      {/* Template Selection Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border p-4 rounded-[14px]">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Select Template:
          </label>
          <Select value={activeTemplateId} onValueChange={setActiveTemplateId}>
            <SelectTrigger className="w-[200px] h-9 text-xs">
              <SelectValue placeholder="Select template..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsAddTemplateOpen(true)}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add Template
          </Button>

          <Button
            onClick={() => {
              if (activeTemplate) {
                setRenameTemplateName(activeTemplate.name);
                setIsRenameTemplateOpen(true);
              }
            }}
            variant="outline"
            size="sm"
            className="text-xs font-semibold flex items-center gap-1 text-primary hover:text-primary/90"
          >
            <Edit3 className="h-3.5 w-3.5" /> Rename Template
          </Button>

          <Button
            onClick={handleDeleteTemplate}
            variant="outline"
            size="sm"
            className="text-xs font-semibold flex items-center gap-1 text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Template
          </Button>
        </div>
      </div>

      {/* Main Builder Workspace */}
      <div className="space-y-6">
        {activeTemplate && (
          <div className="flex flex-col gap-1 bg-slate-100/50 dark:bg-slate-900/40 p-4 border rounded-[14px] px-6">
            <h2 className="text-lg font-black text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary animate-pulse" />{" "}
              {activeTemplate.name}
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              {sections.length} {sections.length === 1 ? "Section" : "Sections"}{" "}
              | {questions.length}{" "}
              {questions.length === 1 ? "Question" : "Questions"}
            </p>
          </div>
        )}

        <div className="flex justify-between items-center bg-card border p-4 rounded-[14px]">
          <span className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Layers className="h-4.5 w-4.5 text-primary" /> Active Sections:{" "}
            {sections.length}
          </span>
          <Button
            onClick={() => setIsAddSectionOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center gap-2 font-semibold"
          >
            <Plus className="h-4 w-4" /> Add Section
          </Button>
        </div>

        <Card className="rounded-[14px] border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-6 space-y-4">
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
              <FileText className="h-3.5 w-3.5 text-primary" /> Sections &
              Checkpoints Assigned to this Round Template
            </div>

            <div className="divide-y divide-border">
              {sections.map((sectionName, sIdx) => {
                const sectionQs = questions.filter(
                  (q) => q.section === sectionName,
                );
                const isExpanded = !!expandedSections[sectionName];
                return (
                  <div
                    key={sectionName}
                    className="py-3.5 space-y-3"
                    draggable
                    onDragStart={() => setDraggedSectionIdx(sIdx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleSectionDrop(sIdx)}
                  >
                    <div className="flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/10 px-3 py-1 rounded-lg transition-colors">
                      <div className="flex items-center gap-3">
                        <div
                          className="cursor-grab text-muted-foreground/60 hover:text-foreground active:cursor-grabbing p-0.5 shrink-0"
                          title="Drag to reorder section"
                        >
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-foreground">
                            {sectionName}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                            {sectionQs.length}{" "}
                            {sectionQs.length === 1 ? "Question" : "Questions"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/10 flex items-center gap-1"
                          onClick={() => toggleExpandSection(sectionName)}
                        >
                          <Eye className="h-3.5 w-3.5" />{" "}
                          {isExpanded ? "Hide Questions" : "View Questions"}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] font-semibold text-primary hover:bg-primary/10 flex items-center gap-1"
                          onClick={() => handleOpenAddQuestion(sectionName)}
                          title="Add Question"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Question
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] font-semibold text-primary hover:bg-primary/5 flex items-center gap-1"
                          onClick={() => handleOpenRenameSection(sectionName)}
                          title="Rename Section"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Rename
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] font-semibold text-destructive hover:bg-destructive/5 flex items-center gap-1"
                          onClick={() => handleDeleteSection(sectionName)}
                          title="Delete Section"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </div>

                    {/* Questions Subtable (Accordian-style transition) */}
                    {isExpanded && (
                      <div className="pl-10 pr-4 py-2 bg-slate-50/40 dark:bg-slate-800/10 rounded-lg border border-dashed border-border/80 space-y-2 mt-2 ml-7">
                        <span className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-widest block mb-2 border-b pb-1">
                          Questions List (Drag handles to reorder within
                          section)
                        </span>

                        {sectionQs.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic py-2">
                            No questions in this section.
                          </p>
                        ) : (
                          sectionQs.map((q, qIdx) => (
                            <div
                              key={q.id}
                              className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/10 transition-colors bg-card"
                              draggable
                              onDragStart={() => setDraggedQuestionId(q.id)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleQuestionDrop(q.id)}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div
                                  className="cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing p-0.5 shrink-0"
                                  title="Drag to reorder question"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>
                                <div className="space-y-1 truncate">
                                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                    {q.question}
                                    {q.required && (
                                      <Badge className="bg-rose-500/10 text-rose-500 text-[10px] font-bold px-1.5 py-0 border-none shrink-0">
                                        Req
                                      </Badge>
                                    )}
                                  </span>
                                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                    Type: {q.answerType}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-primary hover:bg-primary/5"
                                  onClick={() => handleEditQuestion(q)}
                                >
                                  <Edit3 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:bg-destructive/5"
                                  onClick={() => handleDeleteQuestion(q.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* POPUP 0.1: Add Template */}
      <Dialog open={isAddTemplateOpen} onOpenChange={setIsAddTemplateOpen}>
        <DialogContent className="rounded-xl border max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Template Name *
              </label>
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g. Warehouse Night Patrol"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsAddTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddTemplate}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-5"
            >
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POPUP 0.2: Rename Template */}
      <Dialog
        open={isRenameTemplateOpen}
        onOpenChange={setIsRenameTemplateOpen}
      >
        <DialogContent className="rounded-xl border max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Template</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                New Template Name *
              </label>
              <Input
                value={renameTemplateName}
                onChange={(e) => setRenameTemplateName(e.target.value)}
                placeholder="e.g. Office Day Round"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsRenameTemplateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameTemplate}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-5"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POPUP 1: Add Section */}
      <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
        <DialogContent className="rounded-xl border max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                Section Name *
              </label>
              <Input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="e.g. Electrical Safety"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsAddSectionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSection}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-5"
            >
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POPUP 1.5: Rename Section */}
      <Dialog open={isRenameSectionOpen} onOpenChange={setIsRenameSectionOpen}>
        <DialogContent className="rounded-xl border max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Section</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-muted-foreground">
                New Section Name *
              </label>
              <Input
                value={renameSectionName}
                onChange={(e) => setRenameSectionName(e.target.value)}
                placeholder="e.g. Electrical Safety"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsRenameSectionOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameSection}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-5"
            >
              Rename Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POPUP 2: Add/Edit Question */}
      <Dialog open={isAddQuestionOpen} onOpenChange={setIsAddQuestionOpen}>
        <DialogContent className="rounded-[16px] border border-border bg-card shadow-lg max-w-3xl p-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-foreground">
              {editingQuestionId ? "Configure Question" : "Add Question"}
            </h3>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-6 space-y-4 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {/* Left Column - Form */}
              <div className="md:col-span-3 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Question *
                  </label>
                  <Input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Enter your question here..."
                    className="h-10 border-border rounded-lg bg-background text-foreground font-normal text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Answer Type *
                  </label>
                  <Select
                    value={qType}
                    onValueChange={(val) => {
                      setQType(val);
                      if (val === "yes_no") {
                        setQOptions(["Yes", "No"]);
                      } else if (val === "dropdown") {
                        setQOptions(["Option 1", "Option 2"]);
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 border-border rounded-lg bg-background text-foreground font-normal text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes_no">Yes / No</SelectItem>
                      <SelectItem value="text">Free Text</SelectItem>
                      <SelectItem value="textarea">Textarea</SelectItem>
                      <SelectItem value="number">Numeric Input</SelectItem>
                      <SelectItem value="dropdown">Dropdown Options</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Options */}
                {(qType === "yes_no" || qType === "dropdown") && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Options
                    </label>
                    <div className="space-y-2">
                      {qOptions.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className="flex items-center gap-2.5 bg-muted/20 dark:bg-slate-900/50 p-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800"
                        >
                          <div className="h-4 w-4 rounded-full border border-slate-350 dark:border-slate-600 flex items-center justify-center shrink-0">
                            {oIdx === 0 && (
                              <div className="h-2 w-2 rounded-full bg-blue-600" />
                            )}
                          </div>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const updated = [...qOptions];
                              updated[oIdx] = e.target.value;
                              setQOptions(updated);
                            }}
                            className="bg-transparent border-none p-0 text-sm font-normal focus:ring-0 w-full text-slate-800 dark:text-slate-200 focus-visible:outline-none"
                          />

                          {qOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                setQOptions(
                                  qOptions.filter((_, idx) => idx !== oIdx),
                                );
                              }}
                              className="text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-4.5 w-4.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setQOptions([
                            ...qOptions,
                            `Option ${qOptions.length + 1}`,
                          ])
                        }
                        className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 mt-1"
                      >
                        + Add Option
                      </button>
                    </div>
                  </div>
                )}

                {/* Checkboxes */}
                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qRequired}
                      onChange={(e) => setQRequired(e.target.checked)}
                      className="rounded border-slate-350 dark:border-slate-700 text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Required Question
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qPhotoReq}
                      onChange={(e) => setQPhotoReq(e.target.checked)}
                      className="rounded border-slate-350 dark:border-slate-700 text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                    />

                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Enable Photo Upload
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qGpsReq}
                      onChange={(e) => setQGpsReq(e.target.checked)}
                      className="rounded border-slate-350 dark:border-slate-700 text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                    />

                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Capture Location
                    </span>
                  </label>
                </div>
              </div>

              {/* Right Column - Preview */}
              <div className="md:col-span-2 flex flex-col">
                <div className="bg-slate-50 dark:bg-slate-900/35 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex-1 flex flex-col gap-4 min-h-[300px]">
                  <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest block">
                    Preview
                  </span>

                  <div className="space-y-3 flex-1">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug break-words">
                      {qText || "Is CCTV Camera Working?"}
                    </h4>

                    {/* Render simulated preview answer controls */}
                    {qType === "yes_no" && (
                      <div className="space-y-2">
                        {qOptions.map((opt, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                          >
                            <div className="h-4 w-4 rounded-full border border-slate-400 flex items-center justify-center shrink-0">
                              {idx === 0 && (
                                <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                              )}
                            </div>
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {qType === "dropdown" && (
                      <div className="border rounded-lg p-2 bg-background flex items-center justify-between text-xs text-slate-750 dark:text-slate-300">
                        <span>Select option... ({qOptions.join(", ")})</span>
                        <span>▼</span>
                      </div>
                    )}

                    {(qType === "text" ||
                      qType === "textarea" ||
                      qType === "number") && (
                      <div className="border rounded-lg p-3 bg-background/50 border-dashed text-center text-xs text-muted-foreground">
                        {qType === "text" && "Simulated text input field"}
                        {qType === "textarea" &&
                          "Simulated textarea observations block"}
                        {qType === "number" && "Simulated numeric value input"}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-[10px] text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Required Check:</span>
                      <span className="font-bold text-foreground">
                        {qRequired ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Photo Capture:</span>
                      <span className="font-bold text-foreground">
                        {qPhotoReq ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>GPS Logging:</span>
                      <span className="font-bold text-foreground">
                        {qGpsReq ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/35">
            <Button variant="ghost" onClick={() => setIsAddQuestionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveQuestion}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5 py-2 font-semibold"
            >
              Save Question
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
