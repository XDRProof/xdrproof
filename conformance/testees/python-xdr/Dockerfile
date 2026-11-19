# The standalone Python XDR testee: stellar-xdr and stellar-strkey at pinned versions on the same pinned interpreter image.
FROM python@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
ARG XDR=0.2.1
ARG STRKEY=0.2.0
RUN pip install --no-cache-dir --root-user-action=ignore --disable-pip-version-check "stellar-xdr==${XDR}" "stellar-strkey==${STRKEY}"
COPY testee.py /testee.py
ENTRYPOINT ["python", "-I", "/testee.py"]
