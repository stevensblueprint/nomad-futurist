"""Shared staging options for Python Lambda source directories."""

from pathlib import Path

from aws_cdk import aws_lambda as lambda_


PYTHON_CACHE_EXCLUDES = (
    "__pycache__",
    "**/__pycache__",
    "**/__pycache__/**",
    "*.pyc",
    "**/*.pyc",
    "*.pyo",
    "**/*.pyo",
)


def python_lambda_code(directory: Path | str) -> lambda_.Code:
    """Create a Lambda asset without interpreter-generated cache files."""
    return lambda_.Code.from_asset(
        str(directory),
        exclude=list(PYTHON_CACHE_EXCLUDES),
    )
