"""Standalone, on-demand reviewer for Wynntils guild capes and recolors."""

import json
import re
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

from PIL import Image, ImageTk

from recolor_detector import find_recolors, signature, similarity
import scan_cape_guild


ROOT = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[1]
CATALOG = ROOT / "ui" / "catalog"
GUILDS = CATALOG / "guild-capes.json"
RECOLORS = CATALOG / "recolor-links.json"
SORT_RESULTS = ROOT / "work" / "guild-sort-results.json"
SORT_PROGRESS = ROOT / "work" / "guild-sort-progress.json"
scan_cape_guild.ROOT = ROOT
scan_cape_guild.CATALOG = CATALOG


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, document):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


class GuildSorter:
    def __init__(self, root):
        self.root = root
        self.records = read_json(CATALOG / "capes.json")["capes"]
        self.by_sha = {record["sha1"]: record for record in self.records}
        self.guilds = read_json(GUILDS)
        self.recolors = read_json(RECOLORS)
        self.suggestions = {}
        self.selected = None
        self.candidates = []
        self.listed = []
        self.busy = False
        self.preview_images = []
        self.search = tk.StringVar()
        self.only_guilds = tk.BooleanVar()
        self.only_suggestions = tk.BooleanVar(value=True)
        self.color_choice = tk.StringVar(value="All colors")
        self.prefix = tk.StringVar()
        self.guild_name = tk.StringVar()
        self.status = tk.StringVar(value="Choose a cape. Catalog-wide comparison runs only when you request it.")
        self.make_ui()
        self.load_sort_results()
        self.refresh_list()
        self.refresh_progress()

    def make_ui(self):
        self.root.title("Wynntils Guild Cape Sorter — Prism Studio Test")
        self.root.geometry("1280x810")
        self.root.minsize(1050, 650)
        self.root.configure(bg="#111418")
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure("TFrame", background="#111418")
        style.configure("TLabel", background="#111418", foreground="#e9edf3", font=("Segoe UI", 10))
        style.configure("Title.TLabel", font=("Segoe UI Semibold", 18), foreground="#ffffff")
        style.configure("Muted.TLabel", foreground="#9aa7ba")
        style.configure("TButton", padding=(12, 7), font=("Segoe UI", 10))
        style.configure("TEntry", fieldbackground="#22272e", foreground="#ffffff")
        style.configure("TCheckbutton", background="#111418", foreground="#e9edf3")

        top = ttk.Frame(self.root, padding=18)
        top.pack(fill="x")
        ttk.Label(top, text="Guild Cape Sorter", style="Title.TLabel").pack(anchor="w")
        ttk.Label(top, text="Automatic color, design, and lettering suggestions. Review a cape, then accept its proposed guild with one click.",
                  style="Muted.TLabel").pack(anchor="w", pady=(4, 0))

        body = ttk.Frame(self.root, padding=(18, 0, 18, 8))
        body.pack(fill="both", expand=True)
        body.columnconfigure(0, weight=2)
        body.columnconfigure(1, weight=3)
        body.columnconfigure(2, weight=3)
        body.rowconfigure(0, weight=1)

        browser = ttk.Frame(body)
        browser.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        ttk.Label(browser, text="Capes", style="Title.TLabel").pack(anchor="w", pady=(0, 10))
        search = ttk.Entry(browser, textvariable=self.search)
        search.pack(fill="x", pady=(0, 8))
        search.insert(0, "")
        colors = ["All colors", *sorted({record["color"] for record in self.records})]
        ttk.Combobox(browser, textvariable=self.color_choice, values=colors,
                     state="readonly").pack(fill="x", pady=(0, 8))
        ttk.Checkbutton(browser, text="Only suggested guild capes", variable=self.only_suggestions,
                        command=self.refresh_list).pack(anchor="w", pady=(0, 4))
        ttk.Checkbutton(browser, text="Only guild-linked capes", variable=self.only_guilds,
                        command=self.refresh_list).pack(anchor="w", pady=(0, 8))
        ttk.Button(browser, text="Reload automatic results", command=self.reload_results).pack(fill="x", pady=(0, 8))
        list_frame = ttk.Frame(browser)
        list_frame.pack(fill="both", expand=True)
        self.cape_list = tk.Listbox(list_frame, bg="#1a1e23", fg="#e9edf3", selectbackground="#245d82",
                                    borderwidth=0, highlightthickness=0, font=("Consolas", 10), exportselection=False)
        scroll = ttk.Scrollbar(list_frame, orient="vertical", command=self.cape_list.yview)
        self.cape_list.configure(yscrollcommand=scroll.set)
        self.cape_list.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        self.cape_list.bind("<<ListboxSelect>>", self.choose_cape)
        self.count = ttk.Label(browser, text="", style="Muted.TLabel")
        self.count.pack(anchor="w", pady=(8, 0))

        review = ttk.Frame(body)
        review.grid(row=0, column=1, sticky="nsew", padx=12)
        ttk.Label(review, text="Selected cape", style="Title.TLabel").pack(anchor="w", pady=(0, 10))
        self.selected_id = ttk.Label(review, text="Choose a cape")
        self.selected_id.pack(anchor="w")
        self.selected_preview = ttk.Label(review, text="No preview", anchor="center")
        self.selected_preview.pack(fill="x", pady=(12, 10))
        self.current_guild = ttk.Label(review, text="", wraplength=350, justify="left")
        self.current_guild.pack(anchor="w", pady=(0, 8))
        self.ocr_label = ttk.Label(review, text="", style="Muted.TLabel", wraplength=350, justify="left")
        self.ocr_label.pack(anchor="w", pady=(0, 8))
        ttk.Button(review, text="Scan this cape's lettering", command=self.scan_letters).pack(fill="x", pady=(0, 12))
        ttk.Label(review, text="Guild prefix").pack(anchor="w")
        ttk.Entry(review, textvariable=self.prefix).pack(fill="x", pady=(3, 8))
        ttk.Label(review, text="Guild name").pack(anchor="w")
        ttk.Entry(review, textvariable=self.guild_name).pack(fill="x", pady=(3, 10))
        ttk.Button(review, text="Accept suggested guild", command=self.save_guild).pack(fill="x")
        ttk.Label(review, text="Saving records a reviewed link, not proof that the guild owns the cape.",
                  style="Muted.TLabel", wraplength=350).pack(anchor="w", pady=(8, 0))

        relations = ttk.Frame(body)
        relations.grid(row=0, column=2, sticky="nsew", padx=(12, 0))
        ttk.Label(relations, text="Possible recolors", style="Title.TLabel").pack(anchor="w", pady=(0, 10))
        ttk.Button(relations, text="Find recolors of selected cape", command=self.find_matches).pack(fill="x")
        ttk.Label(relations, text="Compares the back design while ignoring exact colors. Check each suggestion visually.",
                  style="Muted.TLabel", wraplength=350).pack(anchor="w", pady=(7, 10))
        self.match_list = tk.Listbox(relations, height=8, bg="#1a1e23", fg="#e9edf3", selectbackground="#245d82",
                                     borderwidth=0, highlightthickness=0, font=("Consolas", 10), exportselection=False)
        self.match_list.pack(fill="x")
        self.match_list.bind("<<ListboxSelect>>", self.choose_match)
        self.match_preview = ttk.Label(relations, text="No recolor selected", anchor="center")
        self.match_preview.pack(fill="x", pady=(12, 8))
        self.match_info = ttk.Label(relations, text="", style="Muted.TLabel", wraplength=350)
        self.match_info.pack(anchor="w", pady=(0, 8))
        ttk.Button(relations, text="Mark candidate as recolor of selected", command=self.save_recolor).pack(fill="x")

        footer = ttk.Frame(self.root, padding=(18, 7, 18, 14))
        footer.pack(fill="x")
        ttk.Label(footer, textvariable=self.status, style="Muted.TLabel", wraplength=1200).pack(anchor="w")
        self.search.trace_add("write", lambda *_: self.refresh_list())
        self.color_choice.trace_add("write", lambda *_: self.refresh_list())

    def load_sort_results(self):
        if not SORT_RESULTS.exists():
            return
        document = read_json(SORT_RESULTS)
        self.suggestions = {item["sha1"]: item for item in document.get("capes", [])}

    def reload_results(self):
        try:
            self.load_sort_results()
            self.refresh_list()
            self.status.set(f"Loaded automatic results for {len(self.suggestions):,} capes.")
        except (OSError, ValueError) as error:
            self.status.set(f"Could not read automatic results: {error}")

    def refresh_progress(self):
        if SORT_PROGRESS.exists():
            try:
                item = read_json(SORT_PROGRESS)
                self.count.configure(text=f"Auto sort: {item['phase']} · {item['done']:,}/{item['total']:,} · "
                                          f"{len(self.guilds['capes']):,} existing guild leads")
            except (OSError, ValueError, KeyError):
                pass
        self.root.after(10000, self.refresh_progress)

    def refresh_list(self):
        query = self.search.get().strip().casefold()
        self.listed = [record for record in self.records if
                       (not self.only_guilds.get() or record["sha1"] in self.guilds["capes"])
                       and (not self.only_suggestions.get() or not self.suggestions
                            or self.suggestions.get(record["sha1"], {}).get("guild_candidates"))
                       and (self.color_choice.get() == "All colors" or record["color"] == self.color_choice.get())
                       and (not query or query in record["id"].casefold()
                            or query in record["sha1"]
                            or any(query in link["tag"].casefold() or query in link["name"].casefold()
                                   for link in self.guilds["capes"].get(record["sha1"], {}).get("guilds", []))
                            or any(query in link["tag"].casefold() or query in link["name"].casefold()
                                   for link in self.suggestions.get(record["sha1"], {}).get("guild_candidates", [])))]
        self.listed.sort(key=lambda record: (record["color"], record["shade"],
                                               tuple(self.suggestions.get(record["sha1"], {}).get("dominant_rgb", (0, 0, 0))),
                                               record["id"]))
        self.cape_list.delete(0, "end")
        for record in self.listed:
            flag = " *" if record["sha1"] in self.guilds["capes"] else " +" if self.suggestions.get(record["sha1"], {}).get("guild_candidates") else ""
            self.cape_list.insert("end", record["id"] + flag)
        self.count.configure(text=f"{len(self.listed):,} shown · {len(self.guilds['capes']):,} existing guild leads")

    def choose_cape(self, _event=None):
        positions = self.cape_list.curselection()
        if not positions:
            return
        self.selected = self.listed[positions[0]]
        sha = self.selected["sha1"]
        self.selected_id.configure(text=f"{self.selected['id']} · {self.selected['resolution']}")
        self.set_preview(self.selected_preview, sha, 0)
        links = self.guilds["capes"].get(sha, {}).get("guilds", [])
        proposal = self.suggestions.get(sha, {})
        proposed_guilds = proposal.get("guild_candidates", [])
        color_peers = proposal.get("color_peers", [])
        self.current_guild.configure(text="Existing leads: " + (", ".join(
            f"{link['tag']} · {link['name']} ({link.get('status', 'unreviewed')})" for link in links) or "none")
            + ("\nAutomatic suggestions: " + ", ".join(
                f"{link['tag']} ({'+'.join(link['evidence'])}, {link['score']:.0%})" for link in proposed_guilds[:3])
               if proposed_guilds else "")
            + ("\nSimilar-color guild leads: " + ", ".join(
                f"{'/'.join(peer['guilds'])} ({peer['distance']:.0%} color distance)" for peer in color_peers[:3])
               if color_peers else ""))
        preferred = proposed_guilds[0] if proposed_guilds else links[0] if links else None
        self.prefix.set(preferred["tag"] if preferred else "")
        self.guild_name.set(preferred["name"] if preferred else "")
        self.ocr_label.configure(text="OCR suggestions: " +
                                 (", ".join(f"{item['text']} ({item['confidence']}%)"
                                            for item in proposal.get("letter_candidates", [])[:5]) or "not yet scanned"))
        self.candidates = []
        self.match_list.delete(0, "end")
        self.match_preview.configure(image="", text="No recolor selected")
        self.match_info.configure(text="")
        related = [(child, parent) for child, parent in self.recolors["links"].items()
                   if sha in (child, parent)]
        if related:
            selected_signature = signature(sha, CATALOG)
            for child, parent in related:
                other_sha = parent if child == sha else child
                record = self.by_sha.get(other_sha)
                if record:
                    score = similarity(selected_signature, signature(other_sha, CATALOG))
                    self.candidates.append((score, record))
                    self.match_list.insert("end", f"Saved  {score * 100:5.1f}%  {record['id']}")
        existing_matches = {record["sha1"] for _, record in self.candidates}
        for match in proposal.get("recolor_candidates", []):
            other_sha = match["sha1"]
            if other_sha in existing_matches or other_sha not in self.by_sha:
                continue
            score = match["score"]
            record = self.by_sha[other_sha]
            self.candidates.append((score, record))
            self.match_list.insert("end", f"Maybe  {score * 100:5.1f}%  {record['id']}")
        self.status.set(f"Selected {self.selected['id']}. Saved recolor links: {len(related)}.")

    def set_preview(self, widget, sha, slot):
        try:
            with Image.open(CATALOG / "back" / f"{sha}.png") as image:
                preview = image.convert("RGBA").resize((200, 320), Image.Resampling.NEAREST)
            photo = ImageTk.PhotoImage(preview)
            if len(self.preview_images) < 2:
                self.preview_images.extend([None] * (2 - len(self.preview_images)))
            self.preview_images[slot] = photo
            widget.configure(image=photo, text="")
        except (FileNotFoundError, OSError):
            widget.configure(image="", text="Preview unavailable")

    def start_work(self, label, task, complete):
        if self.busy:
            self.status.set("A scan is already running.")
            return
        self.busy = True
        self.status.set(label)
        outcome = {}

        def worker():
            try:
                outcome["result"] = task()
            except Exception as error:
                outcome["error"] = error

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

        def poll():
            if thread.is_alive():
                self.root.after(120, poll)
                return
            self.busy = False
            if "error" in outcome:
                self.status.set(f"Could not finish: {outcome['error']}")
            else:
                complete(outcome["result"])

        self.root.after(120, poll)

    def scan_letters(self):
        if not self.selected:
            return
        sha = self.selected["sha1"]

        def complete(readings):
            if not self.selected or self.selected["sha1"] != sha:
                return
            self.ocr_label.configure(text="OCR suggestions: " +
                                     (", ".join(f"{item['text']} ({item['best_confidence']}%)" for item in readings)
                                      or "none; inspect the picture and enter lettering manually"))
            self.status.set("Letter scan finished for this cape only. Confirm the text visually before saving.")

        self.start_work("Scanning lettering on the selected cape only…", lambda: scan_cape_guild.scan(sha, None), complete)

    def find_matches(self):
        if not self.selected:
            return
        sha = self.selected["sha1"]

        def complete(matches):
            if not self.selected or self.selected["sha1"] != sha:
                return
            self.candidates = matches
            self.match_list.delete(0, "end")
            for score, record in matches:
                saved = self.recolors["links"].get(record["sha1"]) == sha or self.recolors["links"].get(sha) == record["sha1"]
                self.match_list.insert("end", f"{'Saved' if saved else 'Maybe'}  {score * 100:5.1f}%  {record['id']}")
            self.status.set(f"Found {len(matches)} possible recolors. Visual review is required before linking.")

        self.start_work("Comparing catalog designs on your request…",
                        lambda: find_recolors(sha, self.records, catalog=CATALOG), complete)

    def choose_match(self, _event=None):
        positions = self.match_list.curselection()
        if not positions:
            return
        score, record = self.candidates[positions[0]]
        self.set_preview(self.match_preview, record["sha1"], 1)
        self.match_info.configure(text=f"{record['id']} · {score * 100:.1f}% pattern similarity")

    def save_guild(self):
        if not self.selected:
            return
        prefix = self.prefix.get().strip()
        name = self.guild_name.get().strip()
        if not re.fullmatch(r"[A-Za-z0-9]{2,6}", prefix) or not name:
            messagebox.showerror("Guild details", "Enter a 2–6 character guild prefix and a guild name.")
            return
        sha = self.selected["sha1"]
        entry = self.guilds["capes"].setdefault(sha, {"guilds": []})
        entry["guilds"] = [link for link in entry["guilds"] if link["tag"].casefold() != prefix.casefold()]
        entry["guilds"].append({"tag": prefix, "name": name, "confidence": "High", "status": "text-reviewed"})
        write_json(GUILDS, self.guilds)
        self.current_guild.configure(text=f"Reviewed lettering: {prefix} · {name}. Cape ownership remains unverified.")
        self.status.set(f"Saved {self.selected['id']} to guild-capes.json. Rebuild Prism Studio Test to include it.")
        self.refresh_list()

    def save_recolor(self):
        positions = self.match_list.curselection()
        if not self.selected or not positions:
            return
        score, record = self.candidates[positions[0]]
        source = self.selected["sha1"]
        child = record["sha1"]
        if self.recolors["links"].get(source) == child:
            messagebox.showerror("Recolor link", "That cape already points back to this one. Choose a single base cape.")
            return
        self.recolors["links"][child] = source
        write_json(RECOLORS, self.recolors)
        self.status.set(f"Marked {record['id']} as a visually reviewed recolor of {self.selected['id']} ({score * 100:.1f}% match).")


if __name__ == "__main__":
    window = tk.Tk()
    GuildSorter(window)
    window.mainloop()
