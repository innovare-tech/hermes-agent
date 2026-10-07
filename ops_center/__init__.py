"""Central de Operações: negócios, canais (autonomia), caixa de entrada, atividade, pessoas e playbooks.

Persistência em ``$HERMES_HOME/ops.db`` (SQLite, só stdlib) para o gateway e o dashboard — processos
diferentes — compartilharem o mesmo estado. Ver ``ops_center.store``.
"""
