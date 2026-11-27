"""CRUD mẫu — copy file này khi làm tính năng mới (router + schema + model + test)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Item
from app.schemas import ItemIn, ItemOut

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=list[ItemOut])
def list_items(session: Session = Depends(get_session)):
    return session.scalars(select(Item).order_by(Item.id)).all()


@router.post("", response_model=ItemOut, status_code=201)
def create_item(body: ItemIn, session: Session = Depends(get_session)):
    item = Item(**body.model_dump())
    session.add(item)
    session.commit()
    return item


@router.get("/{item_id}", response_model=ItemOut)
def get_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "Không tìm thấy")
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "Không tìm thấy")
    session.delete(item)
    session.commit()
