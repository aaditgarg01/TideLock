"""Read-only allowlisted access to the committed pilot evidence."""
import csv
import json
from pathlib import Path
from .store import StoreError


def parse_cell(value):
    if value=='': return None
    if value in ('True','False'): return value=='True'
    try:
        if value.isdigit() or (value.startswith('-') and value[1:].isdigit()): return int(value)
        if any(c in value for c in '.eE'):
            return float(value)
    except ValueError:
        pass
    return value


class PilotEvidence:
    def __init__(self, root):
        self.root=Path(root).resolve()

    def inventory(self):
        return [dict(path=p.relative_to(self.root).as_posix(),bytes=p.stat().st_size,
                     kind=p.suffix[1:]) for p in sorted(self.root.rglob('*'))
                if p.is_file() and not p.is_symlink() and p.suffix in ('.csv','.json','.md','.png')
                and not any(part.startswith('.') for part in p.relative_to(self.root).parts)]

    def resolve(self, name):
        if name not in {i['path'] for i in self.inventory()}:
            raise StoreError('not_found','Evidence file not found',404)
        p=(self.root/name).resolve()
        if not p.is_relative_to(self.root):
            raise StoreError('not_found','Evidence file not found',404)
        return p

    def read(self, name, offset=0, limit=100):
        p=self.resolve(name)
        if p.suffix=='.csv':
            with p.open(newline='') as f:
                text_fields={'scenario','controller','mode','event','detail','reason','disturbance_sha256'}
                rows=[{k:v if k in text_fields else parse_cell(v) for k,v in r.items()} for r in csv.DictReader(f)]
            return dict(kind='table',path=name,total=len(rows),offset=offset,rows=rows[offset:offset+limit])
        if p.suffix=='.json':
            return dict(kind='json',path=name,data=json.loads(p.read_text()))
        if p.suffix=='.md':
            return dict(kind='text',path=name,text=p.read_text())
        return dict(kind='image',path=name)
