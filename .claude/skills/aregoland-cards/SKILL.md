---
description: Aregoland Card-System — Feature-Dokumentation für alle Agenten
globs: **/*
alwaysApply: true
---

# Aregoland Card-System

Dieses Projekt nutzt ein Card-System zur Feature-Dokumentation. Bevor du an einem Feature arbeitest:

1. Lies den Index: `docs/_index.md`
2. Identifiziere die relevante Domain
3. Lade die Card(s) für das Feature, an dem du arbeitest
4. Nutze die Code-Anker aus der Card, um den richtigen Einstiegspunkt zu finden

## Domains

identity, messaging, contacts, spaces, calls, calendar, documents, child-safety, p2p-network, account, i18n, native-app

## Card-Aufbau

Jede Card enthält: Zweck, Status, Code-Anker, Datenfluss, Schlüssel-Exports, Storage-Keys, Abhängigkeiten, Hinweise.

## Regeln

- Wenn du Code in einer Domain änderst, aktualisiere auch die zugehörige Card
- Neue Features → neue Card erstellen nach dem bestehenden Template
- Cards leben in `docs/{domain-name}/`
