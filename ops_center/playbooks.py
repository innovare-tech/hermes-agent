"""Playbooks → jobs do cron do Hermes.

O cron é a fonte da verdade do horário (``schedule``) e do destino (``deliver``): o playbook guarda só
``cron_job_id``. Sem horário, o playbook roda apenas quando você pede ("Executar agora" = job único).
Quem dispara é o ticker do gateway — com o gateway parado, nada roda (o job espera).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from ops_center import store


def prompt_for(p: dict) -> str:
    lines = [f"Execute o playbook “{p['name']}”.", f"Gatilho: {p['trigger']}", "Passos:"]
    steps = [n for n in p.get("nodes") or [] if n.get("kind") not in ("trigger", "end") and (n.get("text") or "").strip()]
    for i, n in enumerate(steps, 1):
        if n.get("kind") == "cond":
            lines.append(f"{i}. Verifique: {n['text']}" + (f" Se não: {n['elseText']}." if n.get("elseText") else ""))
        else:
            lines.append(f"{i}. {n['text']}")
    lines.append("Siga os passos em ordem. Não invente dados; se faltar informação ou acesso, diga exatamente o que falta.")
    return "\n".join(lines)


def _notify() -> None:
    try:
        from cron.scheduler import _notify_provider_jobs_changed

        _notify_provider_jobs_changed()
    except Exception:
        pass


def _job(job_id: Optional[str]) -> Optional[dict]:
    from cron import jobs

    return jobs.get_job(job_id) if job_id else None


def save(data: dict, schedule: str, deliver: str) -> dict:
    """Salva o playbook e cria/atualiza/remove o job recorrente conforme ``schedule``."""
    from cron import jobs

    schedule, deliver = schedule.strip(), (deliver.strip() or "local")
    old = next((p for p in store.list_playbooks() if p["id"] == data.get("id")), None) if data.get("id") else None
    job = _job((old or {}).get("cron_job_id"))
    p = {**data, "cron_job_id": None}
    if schedule:
        name, prompt = f"Playbook · {data['name']}"[:80], prompt_for(data)
        if job:
            parsed = jobs.parse_schedule(schedule)  # ValueError → 400 com a mensagem do cron
            job = jobs.update_job(job["id"], {"name": name, "prompt": prompt, "deliver": deliver,
                                              "schedule": parsed, "schedule_display": parsed.get("display", schedule)})
        else:
            job = jobs.create_job(prompt, schedule, name=name, deliver=deliver, paused=not data.get("enabled", True))
        if data.get("enabled", True) and not job.get("enabled", True):
            job = jobs.resume_job(job["id"])
        elif not data.get("enabled", True) and job.get("enabled", True):
            job = jobs.pause_job(job["id"], "Playbook desligado no painel")
        p["cron_job_id"] = job["id"]
    elif job:
        jobs.remove_job(job["id"])
    _notify()
    return enrich(store.save_playbook(p))


def delete(pid: str) -> None:
    from cron import jobs

    p = next((x for x in store.list_playbooks() if x["id"] == pid), None)
    if p and _job(p.get("cron_job_id")):
        jobs.remove_job(p["cron_job_id"])
        _notify()
    store.delete_playbook(pid)


def run_now(pid: str) -> dict:
    """Agenda uma execução única para já; o ticker do gateway pega no próximo ciclo."""
    from cron import jobs

    p = next((x for x in store.list_playbooks() if x["id"] == pid), None)
    if not p:
        raise KeyError(pid)
    deliver = (_job(p.get("cron_job_id")) or {}).get("deliver") or "local"
    job = jobs.create_job(prompt_for(p), datetime.now(timezone.utc).isoformat(), name=f"Playbook · {p['name']} (agora)"[:80],
                          repeat=1, deliver=deliver)
    _notify()
    store.mark_playbook_run(pid)
    return {"job_id": job["id"], "playbook": enrich(next(x for x in store.list_playbooks() if x["id"] == pid))}


def _ts(iso: Any) -> Optional[float]:
    try:
        return datetime.fromisoformat(str(iso)).timestamp() if iso else None
    except ValueError:
        return None


def enrich(p: dict) -> dict:
    """Junta ao playbook o estado do job: horário, destino, próxima execução, último erro."""
    job = _job(p.get("cron_job_id"))
    out = {**p, "schedule": "", "deliver": "local", "next_run": None, "last_status": None, "last_error": None}
    if job:
        out.update(
            schedule=job.get("schedule_display") or "",
            deliver=job.get("deliver") or "local",
            next_run=_ts(job.get("next_run_at")),
            last_status=job.get("last_status"),
            last_error=job.get("last_error"),
            runs=int(p.get("runs") or 0) + int((job.get("repeat") or {}).get("completed") or 0),
            last_run=max(filter(None, (p.get("last_run"), _ts(job.get("last_run_at")))), default=None),
        )
    return out


def list_all() -> list[dict]:
    return [enrich(p) for p in store.list_playbooks()]

