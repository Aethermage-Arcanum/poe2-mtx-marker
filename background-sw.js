// Chromium-Einstieg (Manifest background.service_worker): lädt Kernlogik und Background-Dienst.
// Firefox nutzt stattdessen background.scripts und lädt diese Datei nicht.
importScripts('lib/core.js', 'background.js');
