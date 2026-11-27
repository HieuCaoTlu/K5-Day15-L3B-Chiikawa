"""LangGraph dạng Workflow: các bước biết trước, chỉ rẽ nhánh khi bị chặn. Không loop trừ khi thật cần.

    START → guard_input ─blocked→ END
                        └→ draft → human_review (interrupt) → finalize → END

Checkpointer: Postgres (PostgresSaver) khi DATABASE_URL là Postgres → bước chờ duyệt sống qua restart;
còn lại InMemorySaver (dev/test — restart là mất lượt đang chờ).
"""

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from app.agent import nodes
from app.agent.state import AgentState
from app.config import get_settings


def make_checkpointer():
    settings = get_settings()
    if settings.is_postgres:
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        url = settings.database_url.replace("postgresql+psycopg://", "postgresql://")
        pool = ConnectionPool(
            url,
            max_size=5,
            open=True,
            kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        )
        saver = PostgresSaver(pool)
        saver.setup()
        return saver
    from langgraph.checkpoint.memory import InMemorySaver

    return InMemorySaver()


def _after_guard(state: AgentState) -> str:
    return END if state.get("blocked") else "draft"


def build_graph(checkpointer=None):
    graph = StateGraph(AgentState)
    graph.add_node("guard_input", nodes.guard_input)
    graph.add_node("draft", nodes.draft)
    graph.add_node("human_review", nodes.human_review)
    graph.add_node("finalize", nodes.finalize)

    graph.add_edge(START, "guard_input")
    graph.add_conditional_edges("guard_input", _after_guard, ["draft", END])
    graph.add_edge("draft", "human_review")
    graph.add_edge("human_review", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile(checkpointer=checkpointer)


@lru_cache
def get_graph():
    return build_graph(make_checkpointer())
