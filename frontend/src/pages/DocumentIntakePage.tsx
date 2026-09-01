import { Camera, CheckCircle2, Eye, FileUp, UploadCloud } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Badge, Banner, Button, Card, PageHeader, PipelineStepper, SectionHeader, TableWrap } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api, apiAssetUrl, type JobStatus } from "../services/api";
import { languageName, titleCase } from "../utils/format";

const pipelineSteps = ["Uploaded", "OCR", "Language Detection", "Translation", "Entity Extraction", "Identity Resolution", "Graph Update"];
const stageIndex: Record<string, number> = { UPLOADED: 0, OCR: 1, LANGUAGE_DETECTION: 2, TRANSLATION: 3, ENTITY_EXTRACTION: 4, IDENTITY_RESOLUTION: 5, GRAPH_UPDATE: 6 };

export function DocumentIntakePage() {
  const { activeCaseId } = useAppContext();
  const { data, error: listError, reload } = useApiResource(() => api.listDocuments(activeCaseId), [activeCaseId]);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [jobId, setJobId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jobId) return;
    let current = true;
    const check = async () => {
      try {
        const status = await api.jobEvents(jobId);
        if (!current) return;
        setJob(status);
        if (status.status === "completed" || status.status === "failed") {
          setJobId("");
          reload();
        }
      } catch (reason) {
        if (current) setError(reason instanceof Error ? reason.message : "Could not check processing status");
      }
    };
    void check();
    const timer = window.setInterval(check, 1000);
    return () => { current = false; window.clearInterval(timer); };
  }, [jobId, reload]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null);
  const startUpload = async () => {
    if (!file) return;
    setError("");
    setUploading(true);
    setJob(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const created = await api.uploadDocument(activeCaseId, form);
      setJobId(created.job_id);
      setJob({ ...created, stage: "UPLOADED", status: "processing", detected_language: null, extracted_entity_count: null, error: null });
      setFile(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  const currentStep = job ? (stageIndex[job.stage] ?? 0) : 0;
  const processing = Boolean(jobId);

  return (
    <div className="page">
      <PageHeader title="Document Intake" description="Upload case records and monitor each evidence-processing stage." actions={<Badge tone="info">{activeCaseId}</Badge>} />
      {(error || listError) && <Banner tone="warning" title="Document service error">{error || listError}</Banner>}
      <Banner title="Original records remain authoritative">Review extracted entities against the source document before confirming relationships.</Banner>
      <div className="intake-grid">
        <Card className="upload-card">
          <SectionHeader title="Add evidence" description="PDF, JPG or PNG up to 25 MB" />
          <label className={`drop-zone ${dragging ? "drop-zone--active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setFile(event.dataTransfer.files[0] ?? null); }}>
            <input type="file" accept=".pdf,image/jpeg,image/png" onChange={chooseFile} /><span className="drop-zone__icon"><UploadCloud /></span><strong>{file ? file.name : "Drop a case record here"}</strong><p>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB ready for upload` : "or select a file from this device"}</p><span className="button button--secondary button--md">Browse files</span>
          </label>
          <div className="upload-actions"><input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={chooseFile} aria-label="Capture a document with camera" /><Button icon={<Camera />} onClick={() => cameraRef.current?.click()}>Use camera</Button><Button variant="primary" icon={<FileUp />} disabled={!file || uploading || processing} onClick={startUpload}>{uploading ? "Uploading…" : processing ? "Processing…" : "Upload evidence"}</Button></div>
          <p className="privacy-note">Files are attached only to the active case. Do not upload unrelated personal records.</p>
        </Card>
        <Card className="pipeline-card">
          <SectionHeader title="Processing pipeline" description={job ? `${job.job_id} · ${titleCase(job.stage)}` : "Ready for a new upload"} />
          <PipelineStepper steps={pipelineSteps} current={currentStep} />
          {job?.status === "completed" && <div className="pipeline-result" role="status"><CheckCircle2 /><span><strong>Graph update completed</strong><small>{job.extracted_entity_count ?? 0} entities extracted · Language {languageName(job.detected_language)}</small></span></div>}
        </Card>
      </div>
      <Card>
        <SectionHeader title="Processed evidence" description="Records returned by the active case API" />
        <TableWrap label="Processed evidence records"><table><thead><tr><th>Document</th><th>Detected language</th><th>Entities</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{(data?.items ?? []).map((doc) => <tr key={doc.document_id}><td><div className="table-primary"><FileUp size={17} /><span><strong>{doc.document_id}</strong><small className="mono">{doc.view_url}</small></span></div></td><td>{languageName(doc.detected_language)}</td><td>{doc.extracted_entity_count ?? "Pending"}</td><td><Badge>{doc.status.toUpperCase()}</Badge></td><td><Button size="sm" variant="ghost" icon={<Eye />} disabled={!doc.view_url} onClick={() => window.open(apiAssetUrl(doc.view_url), "_blank", "noopener,noreferrer")}>View</Button></td></tr>)}</tbody></table></TableWrap>
      </Card>
    </div>
  );
}
