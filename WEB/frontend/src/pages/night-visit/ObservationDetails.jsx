import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Calendar,
  User,
  ShieldAlert,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "../../services/api";

export default function ObservationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [obs, setObs] = useState(null);

  useEffect(() => {
    const fetchObservation = async () => {
      try {
        const res = await api.get("/officer-rounds/reports");
        const reports = res.data;
        for (const r of reports) {
          const match = r.observations?.find((o) => o.id === id);
          if (match) {
            setReport(r);
            setObs(match);
            break;
          }
        }
      } catch (err) {
        console.error("Failed to fetch observation details:", err);
      }
    };
    fetchObservation();
  }, [id]);

  const handleDelete = async () => {
    if (!report || !obs) return;
    if (window.confirm("Are you sure you want to delete this observation?")) {
      try {
        const updatedObs = report.observations.filter((o) => o.id !== obs.id);
        const updatedReport = { ...report, observations: updatedObs };
        await api.post("/officer-rounds/reports", updatedReport);
        navigate("/officer-rounds");
      } catch (err) {
        console.error("Failed to delete observation:", err);
      }
    }
  };

  if (!obs || !report) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Observation not found.</p>
        <Button onClick={() => navigate("/officer-rounds")} variant="outline">
          Back to Reports
        </Button>
      </div>
    );
  }

  const getPriorityColor = (prio) => {
    switch (prio) {
      case "High":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "Medium":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default:
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Completed":
      case "Closed":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "In Progress":
        return "bg-sky-500/10 text-sky-500 border-sky-500/20";
      default:
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      {/* Back Button */}
      <Button
        onClick={() => navigate("/officer-rounds")}
        variant="ghost"
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2"
      >
        <ArrowLeft className="h-4.5 w-4.5" /> Back to Reports
      </Button>

      {/* Header card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Report Ref: {report.reportNo}
            </span>
            <Badge
              className={`${getPriorityColor(obs.priority)} border font-semibold px-2 py-0.5 text-xs`}
            >
              {obs.priority} Priority
            </Badge>
            <Badge
              className={`${getStatusColor(obs.status)} border font-semibold px-2 py-0.5 text-xs`}
            >
              {obs.status}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1 text-foreground">
            {obs.actionPoint}
          </h1>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => navigate(`/officer-rounds/create?edit=${report.id}`)}
            className="border border-primary text-primary hover:bg-primary/5 rounded-lg flex items-center gap-2"
            variant="outline"
          >
            <Edit className="h-4 w-4" /> Edit
          </Button>
          <Button
            onClick={handleDelete}
            className="bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg flex items-center gap-2"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-[14px] border shadow-sm bg-card">
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <h3 className="font-bold text-sm uppercase tracking-wider text-primary">
                  Observation Details
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground bg-muted/20 p-4 rounded-xl border border-border/40">
                  {obs.observation}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Action Required
                  </span>
                  <p className="text-sm font-semibold">
                    {obs.actionRequired || "N/A"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Action Done
                  </span>
                  <p className="text-sm font-semibold">
                    {obs.actionDone || "N/A"}
                  </p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Corrective / Preventive Measures
                  </span>
                  <p className="text-sm font-semibold">
                    {obs.correctiveMeasures || "N/A"}
                  </p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Officer Remarks
                  </span>
                  <p className="text-sm font-semibold">
                    {obs.remarks || "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Photos gallery placeholder */}
          <Card className="rounded-[14px] border shadow-sm bg-card">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-primary">
                Photos Gallery
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {obs.photos && obs.photos.length > 0 ? (
                  obs.photos.map((photo, index) => (
                    <div
                      key={index}
                      className="aspect-video bg-muted rounded-lg overflow-hidden border"
                    >
                      <img
                        src={photo}
                        alt={`Observation screenshot ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-8 text-center bg-muted/10 rounded-xl border border-dashed flex flex-col items-center justify-center text-muted-foreground text-sm">
                    <ShieldAlert className="h-6 w-6 text-muted-foreground/60 mb-2" />
                    No photos uploaded for this observation.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline & Metadata */}
        <div className="space-y-6">
          <Card className="rounded-[14px] border shadow-sm bg-card">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-primary">
                Meta Information
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4.5 w-4.5 text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">
                      Created By
                    </p>
                    <p className="font-semibold text-foreground">
                      {report.officer}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4.5 w-4.5 text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">
                      Created Date
                    </p>
                    <p className="font-semibold text-foreground">
                      {obs.createdTime}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card className="rounded-[14px] border shadow-sm bg-card">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-primary">
                Activity Timeline
              </h3>
              <div className="relative pl-6 border-l border-border/80 space-y-5 py-2">
                <div className="relative">
                  <div className="absolute -left-[30px] top-0 h-4.5 w-4.5 rounded-full bg-emerald-500/10 border border-emerald-500 flex items-center justify-center text-[10px] text-emerald-500 font-bold">
                    ✓
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-foreground">
                      Observation Created
                    </p>
                    <p className="text-xs text-muted-foreground">
                      By {report.officer} on {obs.createdTime}
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -left-[30px] top-0 h-4.5 w-4.5 rounded-full bg-primary/10 border border-primary flex items-center justify-center text-[10px] text-primary font-bold">
                    i
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-foreground">
                      Status set to "{obs.status}"
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Compliance item registered
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}