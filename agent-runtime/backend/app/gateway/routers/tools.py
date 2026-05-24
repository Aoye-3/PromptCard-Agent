from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.gateway.deps import get_config
from deerflow.config.app_config import AppConfig

router = APIRouter(prefix="/api", tags=["tools"])


class ToolResponse(BaseModel):
    name: str = Field(..., description="Tool name")
    group: str = Field(..., description="Tool group")
    use: str = Field(..., description="Tool implementation path")
    enabled: bool = Field(default=True, description="Whether the tool is enabled")


class ToolsListResponse(BaseModel):
    tools: list[ToolResponse]
    builtins: list[str]
    subagent_enabled: bool


@router.get("/tools", response_model=ToolsListResponse, summary="List Enabled Tools")
async def list_tools(config: AppConfig = Depends(get_config)) -> ToolsListResponse:
    return ToolsListResponse(
        tools=[
            ToolResponse(
                name=tool.name,
                group=tool.group,
                use=tool.use,
                enabled=True,
            )
            for tool in config.tools
        ],
        builtins=["present_file", "ask_clarification", "tool_search"],
        subagent_enabled=True,
    )
