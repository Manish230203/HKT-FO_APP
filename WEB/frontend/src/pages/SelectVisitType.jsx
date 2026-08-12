import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sun, Moon, BookOpen, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SelectVisitType() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const clientId = searchParams.get("clientId");
  const siteId = searchParams.get("siteId");
  const plannedId = searchParams.get("plannedId");
  const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const handleSelectType = (type) => {
    if (type === "day") {
      navigate(`/officer-visits/create?clientId=${clientId}&siteId=${siteId}&plannedId=${plannedId}&type=Scheduled&shift=Morning`);
    } else if (type === "night") {
      navigate(`/officer-rounds/create?clientId=${clientId}&siteId=${siteId}&plannedId=${plannedId}&type=Scheduled&shift=Night`);
    } else if (type === "general") {
      navigate(`/general-visits?open=true&clientId=${clientId}&siteId=${siteId}&plannedId=${plannedId}&date=${date}`);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 text-sm">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="rounded-lg text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Select Visit Type</h1>
          <p className="text-xs text-muted-foreground">Select the type of tour you want to conduct for this scheduled visit</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {/* Officer Day Visit Card */}
        <Card 
          onClick={() => handleSelectType("day")}
          className="relative overflow-hidden cursor-pointer hover:border-sky-500/50 hover:bg-sky-500/[0.02] active:scale-98 transition-all group border-border bg-card shadow-md flex flex-col items-center text-center p-8 rounded-[14px]"
        >
          <div className="h-16 w-16 rounded-[14px] bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Sun className="h-8 w-8" />
          </div>
          <CardHeader className="p-0 space-y-2">
            <CardTitle className="text-base font-bold text-foreground">Day Visit</CardTitle>
            <CardDescription className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
              Conduct a scheduled day visit report during the day shift.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Officer Night Round Card */}
        <Card 
          onClick={() => handleSelectType("night")}
          className="relative overflow-hidden cursor-pointer hover:border-sky-500/50 hover:bg-sky-500/[0.02] active:scale-98 transition-all group border-border bg-card shadow-md flex flex-col items-center text-center p-8 rounded-[14px]"
        >
          <div className="h-16 w-16 rounded-[14px] bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Moon className="h-8 w-8" />
          </div>
          <CardHeader className="p-0 space-y-2">
            <CardTitle className="text-base font-bold text-foreground">Night Visit</CardTitle>
            <CardDescription className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
              Conduct a scheduled night visit report during the night shift.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* General Visit Card */}
        <Card 
          onClick={() => handleSelectType("general")}
          className="relative overflow-hidden cursor-pointer hover:border-sky-500/50 hover:bg-sky-500/[0.02] active:scale-98 transition-all group border-border bg-card shadow-md flex flex-col items-center text-center p-8 rounded-[14px]"
        >
          <div className="h-16 w-16 rounded-[14px] bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <BookOpen className="h-8 w-8" />
          </div>
          <CardHeader className="p-0 space-y-2">
            <CardTitle className="text-base font-bold text-foreground">General Visit</CardTitle>
            <CardDescription className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
              Conduct a general visit checklist or surprise audit report.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}