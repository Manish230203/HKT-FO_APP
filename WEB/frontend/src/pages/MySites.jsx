import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Building,
  ChevronDown,
  ChevronRight,
  Shield,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "../services/api";

export default function MySites() {
  const navigate = useNavigate();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClientFilter, setSelectedClientFilter] = useState("all");
  const [expandedClients, setExpandedClients] = useState({});

  useEffect(() => {
    const fetchSites = async () => {
      setLoading(true);
      try {
        const response = await api.get("/assessments/sites");
        setSites(response.data || []);
      } catch (error) {
        console.error("Error loading assigned sites", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSites();
  }, []);

  // Group sites by client
  const groupedSites = React.useMemo(() => {
    const groups = {};
    sites.forEach((site) => {
      const client = site.client_name || "Unknown Client";
      if (!groups[client]) {
        groups[client] = [];
      }
      groups[client].push(site);
    });
    return groups;
  }, [sites]);

  // Clients list for filter select
  const uniqueClientsList = React.useMemo(() => {
    return Object.keys(groupedSites).sort();
  }, [groupedSites]);

  // Toggle expanded client row
  const toggleExpand = (clientName) => {
    setExpandedClients((prev) => ({
      ...prev,
      [clientName]: !prev[clientName],
    }));
  };

  // Filter groups based on search & client selector
  const filteredGroupedSites = React.useMemo(() => {
    const result = {};
    const searchLower = searchQuery.toLowerCase();

    Object.keys(groupedSites).forEach((clientName) => {
      // Apply client filter
      if (selectedClientFilter !== "all" && clientName !== selectedClientFilter) {
        return;
      }

      // Filter sites under this client by search query
      const matchedSites = groupedSites[clientName].filter((site) => {
        return (
          site.name?.toLowerCase().includes(searchLower) ||
          clientName.toLowerCase().includes(searchLower) ||
          (site.branch_name && site.branch_name.toLowerCase().includes(searchLower))
        );
      });

      // If client name matches the search, include all its sites, otherwise only matched ones
      if (clientName.toLowerCase().includes(searchLower)) {
        result[clientName] = groupedSites[clientName];
      } else if (matchedSites.length > 0) {
        result[clientName] = matchedSites;
      }
    });

    return result;
  }, [groupedSites, searchQuery, selectedClientFilter]);

  // Dynamic shield icon colors to match mockup variety
  const getShieldColorClass = (index) => {
    const colors = [
      "text-blue-500 bg-blue-500/10 border-blue-500/20",
      "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      "text-purple-500 bg-purple-500/10 border-purple-500/20",
      "text-amber-500 bg-amber-500/10 border-amber-500/20",
      "text-rose-500 bg-rose-500/10 border-rose-500/20",
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 text-sm text-slate-100">
      
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1224] p-4 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search bar */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search site properties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 border-slate-800 bg-[#161b30] text-slate-100 text-xs rounded-lg w-full focus:ring-1 focus:ring-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading assigned sites...</div>
        ) : Object.keys(filteredGroupedSites).length === 0 ? (
          <div className="text-center py-12 text-slate-400 italic bg-[#0d1224] rounded-xl border border-slate-800">
            No assigned sites found matching your search.
          </div>
        ) : (
          Object.keys(filteredGroupedSites).map((clientName) => {
            const clientSites = filteredGroupedSites[clientName];
            const isExpanded = !!expandedClients[clientName];

            return (
              <div
                key={clientName}
                className="bg-[#0b0f19] rounded-xl border border-slate-900 overflow-hidden transition-all duration-200"
              >
                {/* Accordion Header Row */}
                <div
                  onClick={() => toggleExpand(clientName)}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-900/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-slate-400 shrink-0" />
                    <span className="font-bold text-sm tracking-wide text-slate-100 uppercase">
                      {clientName}
                    </span>
                    <Badge className="bg-slate-800/80 text-slate-400 hover:bg-slate-800 text-[10px] px-2 py-0.5 rounded-full border border-slate-700/30">
                      {clientSites.length} {clientSites.length === 1 ? "Site" : "Sites"}
                    </Badge>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
                  )}
                </div>

                {/* Accordion Content Grid (expanded sites list) */}
                {isExpanded && (
                  <div className="p-4 pt-1 bg-[#090c14] border-t border-slate-900">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {clientSites.map((site, index) => {
                        const shieldClass = getShieldColorClass(index);
                        return (
                          <div
                            key={site.id}
                            onClick={() => navigate(`/officer-visits/create?clientId=${site.clientId || site.CLIENTT}&siteId=${site.id}`)}
                            className="bg-[#101424] hover:bg-[#141a30] p-4 rounded-xl border border-slate-800/60 flex items-center justify-between cursor-pointer transition-all duration-200 shadow-sm"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`h-8 w-8 rounded-full border flex items-center justify-center shrink-0 ${shieldClass}`}>
                                <Shield className="h-4 w-4" />
                              </div>
                              <span className="font-semibold text-xs text-slate-200 truncate pr-2">
                                {site.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <ChevronRight className="h-4 w-4 text-slate-500" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
