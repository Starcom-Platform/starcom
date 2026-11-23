from __future__ import annotations

import json
import sys

import pytest

from rlsh_parser import cli


def test_cli_success_exit_zero(monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli, "run_pipeline", lambda config: {"status": "success"})
    monkeypatch.setattr(sys, "argv", ["rlsh-parser", "run"])

    cli.main()
    output = capsys.readouterr().out
    assert json.loads(output)["status"] == "success"


def test_cli_degraded_exit_two(monkeypatch) -> None:
    monkeypatch.setattr(cli, "run_pipeline", lambda config: {"status": "degraded"})
    monkeypatch.setattr(sys, "argv", ["rlsh-parser", "run"])

    with pytest.raises(SystemExit) as exc:
        cli.main()

    assert exc.value.code == 2


def test_cli_degraded_can_exit_zero(monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli, "run_pipeline", lambda config: {"status": "degraded"})
    monkeypatch.setattr(sys, "argv", ["rlsh-parser", "run", "--allow-degraded-exit-zero"])

    cli.main()
    output = capsys.readouterr().out
    assert json.loads(output)["status"] == "degraded"


def test_cli_failure_exit_one(monkeypatch) -> None:
    monkeypatch.setattr(cli, "run_pipeline", lambda config: {"status": "failure"})
    monkeypatch.setattr(sys, "argv", ["rlsh-parser", "run"])

    with pytest.raises(SystemExit) as exc:
        cli.main()

    assert exc.value.code == 1


def test_cli_exception_exit_one(monkeypatch, capsys) -> None:
    def _boom(config):
        raise RuntimeError("bad")

    monkeypatch.setattr(cli, "run_pipeline", _boom)
    monkeypatch.setattr(sys, "argv", ["rlsh-parser", "run"])

    with pytest.raises(SystemExit) as exc:
        cli.main()

    assert exc.value.code == 1
    output = capsys.readouterr().out
    payload = json.loads(output)
    assert payload["status"] == "failure"
    assert "bad" in payload["error"]


def test_cli_preflight_success_exit_zero(monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli, "run_preflight", lambda config: {"status": "success"})
    monkeypatch.setattr(sys, "argv", ["rlsh-parser", "preflight"])

    cli.main()
    output = capsys.readouterr().out
    assert json.loads(output)["status"] == "success"


def test_cli_preflight_degraded_exit_two(monkeypatch) -> None:
    monkeypatch.setattr(cli, "run_preflight", lambda config: {"status": "degraded"})
    monkeypatch.setattr(sys, "argv", ["rlsh-parser", "preflight"])

    with pytest.raises(SystemExit) as exc:
        cli.main()

    assert exc.value.code == 2