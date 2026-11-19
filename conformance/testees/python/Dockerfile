# The Python testee: stellar-sdk (py-stellar-base) at a pinned version on a pinned interpreter image.
FROM python@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
ARG SDK=17.0.1
RUN pip install --no-cache-dir --root-user-action=ignore --disable-pip-version-check "stellar-sdk==${SDK}"
COPY testee.py /testee.py
ENTRYPOINT ["python", "-I", "/testee.py"]
