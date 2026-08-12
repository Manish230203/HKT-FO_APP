import { useState, useEffect } from "react";
import { 
  CheckCircle2, 
  Clock, 
  Download, 
  AlertCircle,
  FileText,
  Eye,
  Check,
  X
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import api from "../../services/api";
import { useToast } from "@/hooks/use-toast";
import { getStoredUser } from "../../lib/auth";

export default function RegularizationHistory() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 });
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const currentUser = getStoredUser();
  const isFieldOfficerOrAdmin = 
    currentUser?.role?.toLowerCase() === "field officer" || 
    currentUser?.role?.toLowerCase() === "admin";

  // Filters
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("all");
  const [selectedSiteId, setSelectedSiteId] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // View Modal
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  useEffect(() => {
    loadFilterData();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [selectedClientId, selectedSiteId, selectedStatus]);

  const loadFilterData = async () => {
    try {
      const compRes = await api.get("/assessments/clients");
      setCompanies(compRes.data || []);
      const siteRes = await api.get("/assessments/sites");
      setSites(siteRes.data || []);
    } catch (e) {
      console.error("Failed to load filters", e);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const clientParam = selectedClientId === "all" ? "" : `&client_id=${selectedClientId}`;
      const siteParam = selectedSiteId === "all" ? "" : `&site_id=${selectedSiteId}`;
      const statusParam = selectedStatus === "all" ? "" : `&status=${selectedStatus}`;
      const res = await api.get(`/attendance/regularizations?${clientParam}${siteParam}${statusParam}`);
      if (res.data) {
        setRecords(res.data.records || []);
        setStats({
          total: res.data.total || 0,
          approved: res.data.approved || 0,
          pending: res.data.pending || 0,
          rejected: res.data.rejected || 0
        });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to fetch regularization history.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    setActionLoadingId(id);
    try {
      await api.post(`/attendance/regularizations/${id}/approve`);
      toast({
        title: "Success",
        description: "Regularization request approved successfully."
      });
      fetchHistory();
      if (selectedRecord && selectedRecord.id === id) {
        setSelectedRecord((prev) => prev ? { ...prev, status: "Approved" } : null);
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e.response?.data?.detail || "Failed to approve request.",
        variant: "destructive"
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (id) => {
    setActionLoadingId(id);
    try {
      await api.post(`/attendance/regularizations/${id}/reject`);
      toast({
        title: "Success",
        description: "Regularization request rejected successfully."
      });
      fetchHistory();
      if (selectedRecord && selectedRecord.id === id) {
        setSelectedRecord((prev) => prev ? { ...prev, status: "Rejected" } : null);
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e.response?.data?.detail || "Failed to reject request.",
        variant: "destructive"
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Regularization History</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          View history of all attendance regularizations
        </p>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Total Regularizations</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 block">{stats.total}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1">All time</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Approved</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 block">{stats.approved}</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-1">
                {stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) : 0}% of total
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Pending Approval</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 block">{stats.pending}</span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-1">
                {stats.total > 0 ? ((stats.pending / stats.total) * 100).toFixed(1) : 0}% of total
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block tracking-wider">Rejected</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 block">{stats.rejected}</span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 block mt-1">
                {stats.total > 0 ? ((stats.rejected / stats.total) * 100).toFixed(1) : 0}% of total
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Client</label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Site</label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main List Table */}
      <Card className="shadow-sm border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Regularization History List</h3>
            <Button variant="outline" className="text-xs flex items-center gap-1.5 border-slate-200 dark:border-slate-800 dark:hover:bg-slate-850">
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading history logs...</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No regularization records found.</div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead className="font-bold w-12 text-center text-slate-400 dark:text-slate-500">#</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Guard Name</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Emp ID</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Site</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Date</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Shift</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Regularized For</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Original Time</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Regularized Time</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Reason</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Regularized By</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Status</TableHead>
                  <TableHead className="font-bold text-center text-slate-400 dark:text-slate-500">Action</TableHead>
                  <TableHead className="font-bold text-slate-400 dark:text-slate-500">Regularized On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-center font-medium text-slate-500 dark:text-slate-400">{idx + 1}</TableCell>
                    <TableCell className="font-bold text-slate-900 dark:text-slate-100">{r.guardName}</TableCell>
                    <TableCell className="font-semibold text-slate-700 dark:text-slate-300">{r.empId}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">{r.site}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300 font-semibold">{r.date}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400 text-xs">{r.shift}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">{r.regularizedFor}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{r.originalTime}</TableCell>
                    <TableCell className="font-bold text-slate-900 dark:text-slate-100">{r.regularizedTime}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400 text-xs max-w-[150px] truncate">{r.reason}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{r.regularizedBy}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          r.status === "Approved"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50"
                            : r.status === "Pending"
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50"
                            : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRecord(r);
                            setIsViewOpen(true);
                          }}
                          className="p-1.5 h-7 w-7 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 dark:hover:bg-slate-800"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isFieldOfficerOrAdmin && r.status === "Pending" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoadingId === r.id}
                              onClick={() => handleApprove(r.id)}
                              className="p-1.5 h-7 w-7 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                              title="Approve Request"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoadingId === r.id}
                              onClick={() => handleReject(r.id)}
                              className="p-1.5 h-7 w-7 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title="Reject Request"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400 text-xs">{r.regularizedOn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details View Modal */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regularization Detail</DialogTitle>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-4 py-2 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Guard Name</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">{selectedRecord.guardName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Emp ID</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 block">{selectedRecord.empId}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Site</span>
                  <span className="text-slate-800 dark:text-slate-200 block">{selectedRecord.site}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Date</span>
                  <span className="text-slate-800 dark:text-slate-200 block">{selectedRecord.date}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Type</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold block">{selectedRecord.regularizedFor}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Original</span>
                  <span className="text-slate-500 dark:text-slate-400 block">{selectedRecord.originalTime}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Corrected</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">{selectedRecord.regularizedTime}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Reason</span>
                <span className="text-slate-700 dark:text-slate-300 block bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">{selectedRecord.reason}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Approved By</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium block">{selectedRecord.regularizedBy}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Status</span>
                  <Badge className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 mt-1">{selectedRecord.status}</Badge>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2">
            <div className="flex gap-2 mt-2 sm:mt-0">
              {selectedRecord && selectedRecord.status === "Pending" && isFieldOfficerOrAdmin && (
                <>
                  <Button
                    disabled={actionLoadingId === selectedRecord.id}
                    onClick={() => handleApprove(selectedRecord.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Approve
                  </Button>
                  <Button
                    disabled={actionLoadingId === selectedRecord.id}
                    onClick={() => handleReject(selectedRecord.id)}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    Reject
                  </Button>
                </>
              )}
            </div>
            <Button onClick={() => setIsViewOpen(false)} className="bg-indigo-900 dark:bg-indigo-600 hover:bg-indigo-800 dark:hover:bg-indigo-700 text-white">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
