import unittest

import aws_cdk as cdk
from aws_cdk import assertions

from stacks.nomad_stack import NomadStack


class DatabaseConstructTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = cdk.App()
        stack = NomadStack(app, "DatabaseTestStack")
        cls.resources = assertions.Template.from_stack(stack).to_json()["Resources"]

    def test_imported_resources_keep_their_deployed_logical_ids_and_policies(self):
        expected = {
            "RDSDBInstance": "AWS::RDS::DBInstance",
            "EC2VPC": "AWS::EC2::VPC",
            "RDSDBSubnetGroupNomaddbsubnetgroup": "AWS::RDS::DBSubnetGroup",
            "EC2Subnet": "AWS::EC2::Subnet",
            "EC2SecurityGroup": "AWS::EC2::SecurityGroup",
            "EC2SubnetDJ": "AWS::EC2::Subnet",
        }
        for logical_id, resource_type in expected.items():
            with self.subTest(logical_id=logical_id):
                resource = self.resources[logical_id]
                self.assertEqual(resource_type, resource["Type"])
                self.assertEqual("Retain", resource["DeletionPolicy"])
                self.assertEqual("Retain", resource["UpdateReplacePolicy"])
        for resource_type in set(expected.values()):
            self.assertEqual(
                list(expected.values()).count(resource_type),
                sum(resource["Type"] == resource_type for resource in self.resources.values()),
            )

    def test_existing_database_settings_and_network_rules_are_preserved(self):
        database = self.resources["RDSDBInstance"]["Properties"]
        self.assertEqual("db-nomad", database["DBInstanceIdentifier"])
        self.assertEqual("postgres", database["Engine"])
        self.assertTrue(database["DeletionProtection"])
        self.assertFalse(database["PubliclyAccessible"])
        self.assertEqual("nomad-db-subnet-group", database["DBSubnetGroupName"])
        self.assertEqual(["sg-0b0e91786528e3f12"], database["VPCSecurityGroups"])
        subnet_group = self.resources["RDSDBSubnetGroupNomaddbsubnetgroup"]["Properties"]
        self.assertEqual(
            ["subnet-0855eb3b6313a0b17", "subnet-0b2ac62812d715782"],
            subnet_group["SubnetIds"],
        )
        self.assertEqual("10.0.0.0/16", self.resources["EC2VPC"]["Properties"]["CidrBlock"])
        for logical_id, cidr in (("EC2Subnet", "10.0.1.0/24"), ("EC2SubnetDJ", "10.0.2.0/24")):
            subnet = self.resources[logical_id]["Properties"]
            self.assertEqual("vpc-0a87c06973c80eb39", subnet["VpcId"])
            self.assertEqual(cidr, subnet["CidrBlock"])
            self.assertFalse(subnet["MapPublicIpOnLaunch"])
        group = self.resources["EC2SecurityGroup"]["Properties"]
        self.assertEqual("vpc-0a87c06973c80eb39", group["VpcId"])
        self.assertEqual(
            [{"CidrIp": "155.246.151.34/32", "IpProtocol": "tcp", "FromPort": 5432, "ToPort": 5432}],
            group["SecurityGroupIngress"],
        )
        self.assertEqual(
            [{"CidrIp": "0.0.0.0/0", "IpProtocol": "-1"}],
            group["SecurityGroupEgress"],
        )


if __name__ == "__main__":
    unittest.main()
